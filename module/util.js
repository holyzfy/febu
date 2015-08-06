var url = require('url');
var path = require('path');
var fs = require('fs-extra');
var async = require('async');
var debug = require('debug')('febu:util.js');
var gulp = require('gulp');
var gutil = require('gulp-util');
var exec = require('child_process').exec;
var file = require('read-file');
var frep = require('frep');
var File = require('vinyl');
var config = require('../config.js');
var common = require('./common.js');
var Git = require('./git.js');

var util = {};

/**
 * Check if a file or directory is empty
 * @see: https://github.com/codexar/npm-extfs
 *
 * @param {string} searchPath
 * @param {Function} cb
 */
util.isEmpty = function(searchPath, callback) {
    fs.stat(searchPath, function(err, stat) {
        if (err) {
            return callback(true);
        }
        if (stat.isDirectory()) {
            fs.readdir(searchPath, function(err, items) {
                if (err) {
                    return callback(true);
                }
                callback(!items || !items.length);
            });
        } else {
            fs.readFile(searchPath, function(err, data) {
                if (err) {
                    callback(true);
                }
                callback(!data || !data.length)
            });
        }
    });
};

util.formatCommit = function(repo, commit, callback) {
    if (commit && commit.toUpperCase() === 'HEAD') {
        // 取得HEAD版本的版本号
        var git = new Git(repo);
        var args = ['--pretty=format:%h', '--no-patch', 'HEAD'];
        git.exec('show', args, function(err, data) {
            if (err) {
                return callback(err);
            }
            callback(null, data);
        });
    } else {
        commit = commit.slice(0, 7);
        callback(null, commit);
    }
};

// 检出版本库相应的版本
util.getProject = function(project, commit, callback) {
    var repo = project.repo;
    var git = new Git(repo);
    var tasks = [
        function(cb) {
            var src = common.getCwd(repo, 'src');
            util.isEmpty(src, function(empty) {
                if (empty) {
                    git.clone(cb);
                } else {
                    cb(null, '仓库已存在');
                }
            });
        },
        function(data, cb){
            debug('git checkout master');
            git.checkout('master', cb);
        },
        function(data, cb) {
            debug('git pull');
            git.pull(cb);
        },
        function(data, cb) {
            util.formatCommit(repo, commit, cb);
        },
        function(commit, cb) {
            debug('git checkout %s', commit);
            git.checkout(commit, cb);
        }
    ];
    async.waterfall(tasks, callback);
};

/**
 * 标记为已发布
 * @param  db 
 * @param  Object.<type, srcCommit, destCommit, project, db> data
 *                type  发布类型，有效值development, production
 *                src   源版本号
 *                dest  对应目标仓库的版本号
 *                repo
 * @param  callback
 */
util.mark = function(db, data, callback) {
    db.versions.save(data, callback);
};

util.resolvePath = function(from, to, base) {
    var dir = path.dirname(from);
    var thisPath = path.resolve(dir, to);
    return path.relative(base, thisPath);
};

util.getStaticFileType = function() {
    var list =  [
        'css',
        'js',
        'jpg', 'jpeg', 'png', 'gif',
        'mp3', 'aac', 'mpeg', 'flv', 'f4v', 'swf', 'ogg', 'mp4', 'm4v', 'webm', 'wav', 'ogv', 'mov', 'm3u8',
        'ttf', 'otf', 'eot', 'woff', 'woff2', 'svg',
        'vml', 'htc'
    ];
    var ret = list.map(function(item) {
        return '**/*.' + item;
    });
    return ret;
};

util.getVmFileType = function() {
    var list = [
        'shtml', 'html', 'html',
        'jsp', 'vm', 'ftl',
        'php', 'tpl',
        'asp', 'aspx', 'cshtml', 'vbhtml'
    ];
    var ret = list.map(function(item) {
        return '**/*.' + item;
    });
    return ret;
}

// 项目里有requirejs的构建脚本吗
util.hasAMD = function(project, callback) {
    var src = common.getCwd(project.repo, 'src');
    var tools = path.join(src, config.amd.tools);
    var files = [tools, path.join(tools, config.amd.config), path.join(tools, config.amd.optimizer)];
    async.filter(files, fs.exists, function(result) {
        if(result.length === 3) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    });
};

// 取得AMD项目里的config文件路径
util.getConfigPath = function(project, callback) {
    var src = common.getCwd(project.repo, 'src');
    var buildPath = path.join(src, config.amd.tools, config.amd.config);
    file.readFile(buildPath, function(err, data) {
        if(err) {
            return callback(err);
        }

        var build = eval("(" + data + ")");
        var configPath = path.join(src, config.amd.tools, build.mainConfigFile);
        callback(null, configPath);
    });
}

// 处理AMD项目里的config文件
util.replaceConfigPaths = function(contents, newPaths) {
    var reg = /require(?:js)?(?:\.config)?\(([\s\S]*)\)/m;
    contents = contents.match(reg)[1];
    var cfg = eval("(" + contents + ")");
    delete cfg.paths;
    delete cfg.baseUrl;
    cfg.paths = newPaths;
    var newContents = 'require.config(' + JSON.stringify(cfg, null, 4) + ');';
    return newContents;
};

util.regex = {
    script: /<script\b[^<]*\bsrc=[^<]*(?:(?!<\/script>)<[^<]*)*(?:<\/script>|$)/mgi, // 带src属性的script标签
    link: /<link\b[^<]*>/mgi,
    media: /<(?:img|video|audio|source|embed)\b[^<]*>/mgi,
    object: /<object\b[^<]*>/mgi,
    url: /(?:[\:\s]+)url\(([^\)]+)\)/mgi // 样式表里url(xxx)
};

/**
 * @param  obj  Development或者Production实例
 * @param  env  development或者production
 * @param  {File} file @see: https://github.com/wearefractal/vinyl
 */
util.getReplacements = function(obj, env, file) {
    var patterns = [
        {
            // css
            pattern: util.regex.link,
            replacement: function(match) {
                if(!obj.replaceHref) {
                    return match;
                }

                var attrs = (match.match(/<link\b([^\>]+)>/i)[1] || '').trim().split(/\s+/);
                
                var css = attrs.some(function(item) {
                    return item === 'rel="stylesheet"' || item === "rel='stylesheet'"
                });
                if(!css) {
                    return match;
                }

                return obj.replaceHref(attrs, match, file);
            }
        },
        {
            // js
            pattern: util.regex.script,
            replacement: function(match) {
                if(!obj.replaceSrc) {
                    return match;
                }
                var attrs = (match.match(/<script\b([^\>]+)>/i)[1] || '').trim().split(/\s+/);
                return obj.replaceSrc(attrs, match, file);
            }
        },
        {
            // media
            pattern: util.regex.media,
            replacement: function(match) {
                if(!obj.replaceSrc) {
                    return match;
                }
                var attrs = (match.match(/<(?:img|video|audio|source|embed)\b([^\>]+)>/i)[1] || '').trim().split(/\s+/);
                return obj.replaceSrc(attrs, match, file);
            }
        },
        {
            // object
            pattern: util.regex.object,
            replacement: function(match) {
                if(!obj.replaceData) {
                    return match;
                }
                var attrs = (match.match(/<object\b([^\>]+)>/i)[1] || '').trim().split(/\s+/);
                return obj.replaceData(attrs, match, file);
            }
        },
        {
            // url
            pattern: util.regex.url,
            replacement: function(match, first) {
                if(!obj.replaceUrl) {
                    return match;
                }
                return obj.replaceUrl(match, first, file);
            }
        }
    ];

    // 禁止外部函数修改patterns
    var ret = [].concat(patterns);

    return ret;
};

util.replacePath = function (obj, env) {
    var fn = function(file, enc, cb) {
        file = new File(file);

        if(file.isNull()) {     
            return cb(null, file);      
        }
        
        var replacements = util.getReplacements(obj, env, file);
        file.contents = new Buffer(frep.strWithArr(file.contents.toString(), replacements));
        cb(null, file);
    };

    return fn;
};

/**
 * 求filepath的相对路径（相对于fromFile.base）
 * 约定：不处理inc目录
 */
util.relPath = function(fromFile, filepath) {
    var inc = '/inc/';
    var hasInc = fromFile.path.lastIndexOf(inc) > 0;
    if(hasInc) {
        return filepath;
    }

    var dirname = path.dirname(fromFile.path);
    var thisFile = new File({
        base: fromFile.base,
        path: path.resolve(dirname, filepath)
    });
    var thisPath = thisFile.relative.replace(new RegExp('\\' + path.sep, 'g'), '/');
    return thisPath;
};

module.exports = util;