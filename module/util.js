var config = require('../config.js');
var url = require('url');
var path = require('path');
var fs = require('fs');
var async = require('async');
var debug = require('debug')('febu:' + __filename);
var Git = require('./git.js');

var util = {};

/**
 * 取得仓库的路径名
 * @param  {[type]} repo [description]
 * @return {[type]}      [description]
 */
util.getPathname = function(repo) {
    var urlMap = url.parse(repo);
    var pathname = urlMap.pathname.match(/^\/?(.*)$/)[1].replace('/', '_');
    return pathname;
};

/**
 * 取得仓库的根目录
 * @param repo 仓库地址
 * @param type 有效值src, build, development, production
 * @return {String}
 */
util.getCwd = function(repo, type) {
    var dataPath = config.dataPath || 'data/';
    var pathname = util.getPathname(repo);
    var urlMap = url.parse(repo);
    var local = path.resolve(dataPath, type, urlMap.hostname, pathname);
    return local;
}

/**
 * Check if a file or directory is empty
 * see: https://github.com/codexar/npm-extfs
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
    if (commit.toUpperCase() === 'HEAD') {
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
        callback(null, commit);
    }
};

// 检出版本库相应的版本
util.getProject = function(project, commit, callback) {
    var repo = project.repo;
    var git = new Git(repo);

    var tasks = [
        function(cb) {
            var src = util.getCwd(repo, 'src');
            util.isEmpty(src, function(empty) {
                if (empty) {
                    git.clone(cb);
                } else {
                    cb(null, '仓库已存在');
                }
            });
        },
        function(data, cb){
            git.checkout('master', cb);
        },
        function(data, cb) {
            git.pull(cb);
        },
        function(data, cb) {
            util.formatCommit(repo, commit, cb);
        },
        function(commit, cb) {
            git.checkout(commit, cb);
        }
    ];
    async.waterfall(tasks, callback);
};

// 收集要处理的文件列表
util.getSource = function(project, commit, callback) {
    var source = [];
    var git = new Git(project.repo);
    var src = util.getCwd(project.repo, 'src');
    if (project.version) {
        git.diff(project.version, commit, function(err, ret) {
            if (err) {
                return callback(err);
            }

            ret.forEach(function(item) {
                item = path.join(src, item);
                source.push(item)
            });
            callback(null, source);
        });
    } else {
        callback(null, ['**/*']);
    }
};

/**
 * 标记为已发布
 * @param  db 
 * @param  Object.<type, srcCommit, destCommit, project, db> options
 *                type  发布类型，有效值development, production
 *                src   源版本号
 *                dest  对应目标仓库的版本号
 *                repo
 * @param  callback
 */
util.mark = function(db, data, callback) {
    db.versions.save(data, callback);
};

/**
 * 查找被引用的文件
 * @param  {Array}    source 相对于仓库根目录的文件列表
 * @param  {Function} callback(err, data)
 */
util.getRelatedFiles = function(source, callback) {
    // TODO 查找，去重
};

util.resolvePath = function(from, to, base) {
    var dir = path.dirname(from);
    var thisPath = path.resolve(dir, to);
    return path.relative(base, thisPath);
};

util.regex = {
    // 带src属性的script标签
    script: /<script\b[^<]*\bsrc=[^<]*(?:(?!<\/script>)<[^<]*)*(?:<\/script>|$)/mgi,

    link: /<link\b[^<]*>/mgi,
    media: /<(?:img|video|audio|source|embed)\b[^<]*>/mgi,
    object: /<object\b[^<]*>/mgi,
};

module.exports = util;