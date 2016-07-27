var url = require('url');
var path = require('path');
var fs = require('fs-extra');
var async = require('async');
var debug = require('debug')('febu:util.js');
var gulp = require('gulp');
var exec = require('child_process').exec;
var frep = require('frep');
var File = require('vinyl');
var config = require('config');
var del = require('del');
var through2 = require('through2');
var common = require('./common.js');
var Git = require('./git.js');

var util = {};

util.getProject = (project, commit, callback) => {
    var repo = project.repo;
    var git = new Git(repo);
    var tasks = [
        cb => {
            debug('clone');
            git.clone(function ignoreError() {
                cb();
            });
        },
        cb => {
            var args = ['origin', project.branch + ':' + project.branch];
            debug('git fetch %s', args.join(' '));
            git.fetch(args, cb);
        },
        cb => {
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

util.resolvePath = (from, to, base) => {
    var thisPath = path.resolve(path.dirname(from), to);
    return path.relative(base, thisPath);
};

util.getStaticFileType = () => {
    var list = [
        'css',
        'js',
        'jpg', 'jpeg', 'png', 'gif', 'webp',
        'mp3', 'aac', 'mpeg', 'flv', 'f4v', 'swf', 'ogg', 'mp4', 'm4v', 'webm', 'wav', 'ogv', 'mov', 'm3u8',
        'ttf', 'otf', 'eot', 'woff', 'woff2', 'svg',
        'vml', 'htc'
    ];
    return list.map(item => '**/*.' + item);
};

util.getVmFileType = () => {
    var list = [
        'shtml', 'html', 'html',
        'jsp', 'vm', 'ftl',
        'php', 'tpl',
        'asp', 'aspx', 'cshtml', 'vbhtml'
    ];
    return list.map(item => '**/*.' + item);
};

util.getAMDBuildPath = project => {
    var src = common.getCwd(project.repo, 'src');
    var configFile = path.join(src, config.project);
    var buildPath = util.getProjectConfig(project, 'build');
    return path.resolve(path.dirname(configFile), buildPath);
};

// 项目里有requirejs的构建脚本吗
util.hasAMD = project => {
    try {
        util.getAMDBuildPath(project);
        return true;
    } catch(err) {
        return false;
    }
};

var getAMDConfigFieldPath = (project, key) => {
    var buildPath = util.getAMDBuildPath(project);
    var content = fs.readFileSync(buildPath, 'utf8');
    var data = eval("(" + content + ")");
    return path.resolve(path.dirname(buildPath), data[key]);
};

util.getAMDConfigPath = project => {
    return getAMDConfigFieldPath(project, 'mainConfigFile');
};

util.getAMDOutputPath = project => {
    return getAMDConfigFieldPath(project, 'dir');
};

util.fixAMDPathKey = paths => {
    for (var key in paths) {
        paths[key] = paths[paths[key]] || paths[key];
    }
    return paths;
};

// 替换AMD项目里的js文件路径
util.replaceConfigPaths = (contents, newPaths) => {
    var reg = /require(?:js)?(?:\.config)?\(([\s\S]*)\)/m;
    var reg2 = /\brequire\s*=\s*({[\s\S]*})/m;
    var pattern = contents.match(reg) ? reg : reg2;

    try {
        var configText = contents.match(pattern)[1];
    } catch(error) {
        return contents;
    }

    var cfg = eval("(" + configText + ")");
    delete cfg.baseUrl;
    Object.assign(cfg.paths, newPaths);
    cfg.paths = util.fixAMDPathKey(cfg.paths);
    var newContents = contents.replace(pattern, (match, sub) => {
        return match.replace(sub, JSON.stringify(cfg, null, 4));
    });
    return newContents;
};

util.regex = {
    script: /<script\b[^<]*\bsrc=[^<]*(?:(?!<\/script>)<[^<]*)*(?:<\/script>|$)/mgi, // 带src属性的script标签
    link: /<link\b[^<]*>/mgi,
    media: /<(?:img|video|audio|source|embed)\b[^<]*>/mgi,
    object: /<object\b[^<]*>/mgi,
    srcset: /\bsrcset='?"?([^'"]*)'?"?\b/mi,
    url: /[:,]?\burl\('?"?([^"'()]+\.\w+)\??[^"'()]*'?"?\)/mgi // 样式表里url(xxx)
};

/**
 * @param  obj  Development或者Production实例
 * @param  env  development或者production
 * @param  {File} file @see: https://github.com/wearefractal/vinyl
 */
util.getReplacements = (obj, env, file) => {
    var patterns = [
        {

            // css
            pattern: util.regex.link,
            replacement: match => {
                if(!obj.replaceHref) {
                    return match;
                }

                var attrs = (match.match(/<link\b([^\>]+)>/i)[1] || '').trim().split(/\s+/);
                
                var css = attrs.some(item => (item === 'rel="stylesheet"' || item === "rel='stylesheet'"));
                if(!css) {
                    return match;
                }

                return obj.replaceHref(attrs, match, file);
            }
        },
        {

            // js
            pattern: util.regex.script,
            replacement: match => {
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
            replacement: match => {
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
            replacement: match => {
                if(!obj.replaceData) {
                    return match;
                }
                var attrs = (match.match(/<object\b([^\>]+)>/i)[1] || '').trim().split(/\s+/);
                return obj.replaceData(attrs, match, file);
            }
        },
        {
            pattern: util.regex.srcset,
            replacement: (match, first) => {
                if(!obj.replaceSrcset) {
                    return match;
                }
                var srcList = first.split(/\s*,\s*/).map(item => item.split(/\s+/)[0]);
                return obj.replaceSrcset(match, srcList, file);
            }
        },
        {

            // url
            pattern: util.regex.url,
            replacement: (match, first) => {
                if(!obj.replaceUrl) {
                    return match;
                }
                return obj.replaceUrl(match, first, file);
            }
        }
    ];

    return patterns;
};

util.replacePath = (obj, env) => {
    return (file, enc, cb) => {
        file = new File(file);
        if(file.isNull()) {     
            return cb(null, file);      
        }
        
        var replacements = util.getReplacements(obj, env, file);
        file.contents = new Buffer(frep.strWithArr(file.contents.toString(), replacements));
        cb(null, file);
    };
};

/**
 * 求filepath的相对路径（相对于fromFile.base）
 * 约定：不处理inc目录
 */
util.relPath = (fromFile, filepath) => {
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
util.getIgnore = src => {
    var ignoreList = [];
    var configFile = path.join(src, config.project);
    try {
        var exist = fs.existsSync(configFile);
        if(exist) {
            var data = fs.readJsonSync(configFile);
            ignoreList = data.ignore || [];
        }
    } catch(err) {
        console.error('配置文件%s格式错误%s：', configFile, err.message);
    }

    var ret = [];
    ignoreList.forEach(item => {
        item = '/' === item.slice(-1) ? item.slice(0, -1): item;
        ret.push('!' + item + '/**/*');
        ret.push('!' + item);
    });

    return ret;
};

util.getProjectConfig = (project, key) => {
    var src = common.getCwd(project.repo, 'src');
    var configPath = path.join(src, config.project);
    var ret = null;
    try {
        ret = fs.readJsonSync(configPath);
        key.split('.').forEach(item => (ret = ret[item]));
    } catch(err) {
        ret = null;
    }
    return ret;
};

/**
 * @param {Object} project
 * @param {String} type development或者production
 */
util.getProjectPublicPath = (project, type) => {
    var publicPath = project.publicPath || util.getProjectConfig(project, type + '.publicPath') || '';

    // publicPath should be end with /
    if(publicPath.slice(-1) !== '/') {
        publicPath += '/';
    }
    return publicPath;
};

util.clean = (dir, done) => {
    return done => {
        del(dir, { force: true }).then(() => done());   
    };
};

util.taskDone = done => {
    return through2.obj(function (data, enc, cb) {
        cb();
    },
    function gulpTask(cb) {
        cb();
        done();
    });
};

module.exports = util;