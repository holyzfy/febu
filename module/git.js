var exec = require('child_process').exec;
var url = require('url');
var mkdirp = require('mkdirp');
var path = require('path');
var debug = require('debug')('febu:' + __filename);
var config = require('../config.js');
var async = require('async');

/**
 * @constructor
 * @param url 仓库地址
 */
function Git(url, options) {
	this.binary = 'git';
	this.url = url;
	options = options || {};
	this.cwd = options.cwd || process.cwd();
	delete options.cwd;
	this.args = Git.optionsToString(options);
}

/**
 * git.exec(command [[, options], args ], callback)
 * see: https://github.com/pvorb/node-git-wrapper
 */
Git.prototype.exec = function(command, options, args, callback) {
    callback = arguments[arguments.length - 1];

    if (arguments.length == 2) {
        options = {};
        args = [];
    } else if (arguments.length == 3) {
        args = arguments[1];
        options = [];
    }

    args = args.join(' ');
    options = Git.optionsToString(options)

    var cmd = this.binary + ' ' + this.args + ' ' + command + ' ' + options + ' ' + args;
    debug("cmd=%s", cmd);
    exec(cmd, {
        cwd: this.cwd
    }, function(err, stdout, stderr) {
        callback(err || stderr, stdout);
    });
};

// see: https://github.com/pvorb/node-git-wrapper
Git.optionsToString = function(options) {
    var args = [];

    for (var k in options) {
        var val = options[k];

        if (k.length == 1) {
            // val is true, add '-k'
            if (val === true)
                args.push('-' + k);
            // if val is not false, add '-k val'
            else if (val !== false)
                args.push('-' + k + ' ' + val);
        } else {
            if (val === true)
                args.push('--' + k);
            else if (val !== false)
                args.push('--' + k + '=' + val);
        }
    }

    return args.join(' ');
};

/**
 * 克隆仓库
 * 克隆出来的目录结构是：一级目录是仓库域名，二级目录是由路径构成（/用_代替）
 * @param callback(err)
 */
Git.prototype.clone = function(callback) {
	var git = this;
	var dataPath = config.dataPath || 'data/';
	var urlMap = url.parse(git.url);
	var pathname = urlMap.pathname.match(/^\/?(.*)$/)[1].replace('/', '_');
	var local = path.resolve(dataPath, 'src', urlMap.hostname, pathname);
	async.each([dataPath, local], mkdirp, function(err) {
		if(err) {
			return callback(err);
		}
		git.exec('clone', [git.url, local], function(err, stdout, stderr) {
			callback(err || stderr, stdout);
		});
	});
	return git;
}

/**
 * 从远程仓库拉取当前分支
 * @param callback(err)
 */
Git.prototype.pull = function(callback){
	// TODO
	return this;
};

/**
 * 切换分支
 * @param branch 分支名
 * @param callback(err)
 */
Git.prototype.checkout = function(branch, callback){
	// TODO
	return this;
};

/**
 * 查询日志
 * @param commit 版本号
 * @param callback(err, Object.<commit, date, message, author>)
 */
Git.prototype.show = function(commit, callback) {
	var git = this;
	// TODO
	// git show --pretty=format:"%h | %an | %ct%n%s" --no-patch commitid
	return git;
};

/**
 * 比较两次提交的差异，列出的数组项由目录+文件名构成
 * @param from 版本号
 * @param to   版本号
 * @param callback(err, Array)
 */
Git.prototype.diff = function(from, to, callback) {
	// TODO
	return this;
};

module.exports = Git;