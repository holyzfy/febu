var url = require('url');
var path = require('path');
var debug = require('debug')('febu:' + __filename);
var async = require('async');
var fs = require('fs-extra');
var shell = require('shelljs');
var config = require('../config.js');
var common = require('./common.js');

/**
 * @constructor
 * @param url 仓库地址
 * @param {Object} options 其他参数
 */
function Git(url, options) {
    this.binary = 'git';
	this.url = url;
    options = options || {}
	this.options = options || {};
    this.options.type = options.type || 'src';
    this.options.cwd = options.cwd || common.getCwd(url, this.options.type);
}

/**
 * 运行git命令
 * @param  {String} command  git命令
 * @param  {Array}   args     git参数
 * @param  {Function} callback(err, data)
 */
Git.prototype.exec = function(command, args, callback) {
    var git = this;
    callback = arguments[arguments.length - 1];
    if (arguments.length < 3) {
        args = [];
    }

    shell.cd(git.options.cwd);
    
    var _command = [git.binary, command].concat(args).join(' ');
    shell.exec(_command, {
        async: true,
        silent: true
    }, function(code, output) {
        var err = code === 0 ? null : output;
        callback(err, output);
    });

    return git;
};

// 初始化仓库
Git.prototype.init = function(callback) {
    var git = this;
    var gitDir = path.join(git.options.cwd, '.git');
    fs.exists(gitDir, function(exists) {
        if(exists) {
            callback();
        } else {
            git.exec('init', callback);
        }
    });
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
	async.each([dataPath, local], fs.mkdirs, function(err) {
		if(err) {
			return callback(err);
		}
		git.exec('clone', [git.url, local], callback);
	});
	return git;
}

/**
 * 从远程仓库拉取当前分支
 * @param callback(err)
 */
Git.prototype.pull = function(callback){
	var git = this;
    git.exec('pull', callback);
	return git;
};

/**
 * 检出指定版本
 * @param commit 分支名或者版本号
 * @param callback(err)
 */
Git.prototype.checkout = function(commit, callback){
	var git = this;
    git.exec('checkout', [commit], callback);
	return git;
};

/**
 * 查询日志
 * @param commit 版本号
 * @param callback(err, Object.<commit, date, message, author>)
 */
Git.prototype.show = function(commit, callback) {
	var git = this;
    var args = ['--pretty="format:%h | %an | %ct%n%s"', '--no-patch', commit];
    git.exec('show', args, function(err, data) {
        // debug('show:', arguments);
        if(err) {
            return callback(err);
        }

        var dataArray = data.split(/\r?\n/);
        var reg = /^([^|]+)\s*|\s*([^|]+)\s*|\s*([[^|]+])$/gi;
        var metadata = dataArray[0].match(reg);
        // 转成毫秒
        var date = metadata[2].trim();
        date = date.length < 13 ? parseInt(date) * 1000 : date;
        var ret = {
            commit: metadata[0].trim(),
            author: metadata[1].trim(),
            datetime: date,
            message: dataArray[1].trim()
        }
        // debug('show callback ret=', ret);
        callback(null, ret);
    });
	return git;
};

/**
 * 比较两次提交的差异
 * @param from 版本号
 * @param [to] 版本号
 * @param callback(err, Array)
 */
Git.prototype.diff = function(from, to, callback) {
	var git = this;
    callback = arguments[arguments.length - 1];
    // 跳过已删除的文件
    var args = [from, to, '--name-only', '--diff-filter=ACMRTUXB'];
    git.exec('diff', args, function(err, data){
        if(err) {
            return callback(err);
        }

        var ret = data.trim().split(/\r?\n/);
        callback(null, ret);
    });

    return git;
};

/**
 * 取得HEAD的版本号
 */
Git.prototype.getHeadCommit = function(callback) {
    var git = this;
    var args = ['--pretty=format:%h', '--no-patch', 'HEAD'];
    git.exec('show', args, function(err, data) {
        if(err) {
            return callback(err);
        }
        callback(null, data);
    });
}

Git.prototype.addAll = function(callback) {
    var git = this;
    var args = ['.'];
    git.exec('add', args, callback);
    return git;
}

Git.prototype.commit = function(message, callback) {
    var git = this;
    callback = arguments[arguments.length - 1];
    if(arguments.length === 1) {
        message = 'empty message';
    }
    message = message.replace(/['"'\s]/g, '_');
    var args = ['-m', "'" + message + "'"];
    git.exec('commit', args, callback);
    return git;
}

module.exports = Git;