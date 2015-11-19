var debug = require('debug')('febu:git.js');
var fs = require('fs-extra');
var shell = require('shelljs');
var config = require('config');
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
    shell.exec(_command, function(code, output) {
        var err = code === 0 ? null : output;
        callback(err, output);
    });

    return git;
};

/**
 * 克隆仓库
 * 克隆出来的目录结构是：一级目录是仓库域名，二级目录是由路径构成（/用_代替）
 * @param callback(err)
 */
Git.prototype.clone = function(callback) {
	var git = this;
	var local = common.getCwd(git.url, 'src');
    fs.mkdirs(local, function(err) {
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

module.exports = Git;