var url = require('url');
var path = require('path');
var fs = require('fs-extra');
var async = require('async');
var debug = require('debug')('febu:util.js');
var gulp = require('gulp');
var gutil = require('gulp-util');
var exec = require('child_process').exec;
var frep = require('frep');
var File = require('vinyl');
var config = require('config');
var common = require('./common.js');
var Git = require('./git.js');

var util = {};

// 检出版本库相应的版本
util.getProject = function(project, commit, callback) {
    var repo = project.repo;
    var git = new Git(repo);
    var tasks = [
        function(cb) {
            debug('clone');
            git.clone(function() {
                // ignore clone error when project is existed
                cb();
            });
        },
        function(cb){
            debug('git checkout master');
            git.checkout('master', cb);
        },
        function(cb) {
            debug('git pull');
            git.pull(cb);
        },
        function(cb) {
            debug('git checkout %s', commit);
            if('HEAD' === commit.toUpperCase()) {
                cb();
            } else {
                git.checkout(commit, cb);
            }
        }
    ];
    async.series(tasks, callback);
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

util.getAMDBuildPath = function(project) {
    var src = common.getCwd(project.repo, 'src');
    var configFile = path.join(src, config.project);
    var buildPath = util.getProjectConfig(project, 'build');
    return path.resolve(path.dirname(configFile), buildPath);
};

// 项目里有requirejs的构建脚本吗
util.hasAMD = function (project) {
    try {
        util.getAMDBuildPath(project);
        return true;
    } catch(err) {
        return false;
    }
};

var getAMDConfigFieldPath = function(project, key) {
    var buildPath = util.getAMDBuildPath(project);
    var content = fs.readFileSync(buildPath, 'utf8');
    var data = eval("(" + content + ")");
    return path.resolve(path.dirname(buildPath), data[key]);
}

util.getAMDConfigPath = function(project) {
    return getAMDConfigFieldPath(project, 'mainConfigFile');
};

util.getAMDOutputPath = function(project) {
    return getAMDConfigFieldPath(project, 'dir');
};

// 替换AMD项目里的js文件路径
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
    var fromFilePath = fromFile.path.replace(new RegExp('\\' + path.sep, 'g'), '/');
    var inc = '/inc/';
    var hasInc = fromFilePath.lastIndexOf(inc) > 0;

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

/**
 * 取得忽略列表：读取febu.json的ignore字段
 * @param src 项目根目录
 */
util.getIgnore = function(src) {
    var ret = [];
    var configFile = path.join(src, config.project);
    try {
        var exist = fs.existsSync(configFile);
        if(exist) {
            var data = fs.readJsonSync(configFile);
            ret = data.ignore || [];
        }
    } catch(err) {
        console.error('配置文件%s格式错误%s：', configFile, err.message);
    }

    ret = ret.map(function(item) {
        // 如果是目录，结尾需要增加**/*
        item = (item.slice(-1) === '/') ? (item + '**/*') : item;
        return '!' + item;
    });

    return ret;
};

util.getProjectConfig = function(project, key) {
    var src = common.getCwd(project.repo, 'src');
    var configPath = path.join(src, config.project);
    var ret = null;
    try {
        ret = fs.readJsonSync(configPath);
        key.split('.').forEach(function(item) {
            ret = ret[item];
        });
    } catch(err) {
        ret = null;
    }
    return ret;
};

/**
 * @param {Object} project
 * @param {String} type development或者production
 */
util.getProjectPublicPath = function(project, type) {
    var publicPath = util.getProjectConfig(project, type + '.publicPath');

    // publicPath should be end with /
    if(publicPath.slice(-1) !== '/') {
        publicPath += '/';
    }
    return publicPath;
}

module.exports = util;