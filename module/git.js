var exec = require('child_process').exec;
var url = require('url');
var mkdirp = require('mkdirp');
var path = require('path');
var debug = require('debug')('febu:' + __filename);
// var async = require('async');

/**
 * @constructor
 * @param url 仓库地址
 */
function Git(url) {
	this.url = url;
}

/**
 * 克隆仓库
 * 克隆出来的目录结构是：一级目录是仓库域名，二级目录是由路径构成（/用_代替）
 * @param callback(err)
 */
Git.prototype.clone = function(callback) {
	var git = this;
	var urlMap = url.parse(git.url);
	var pathname = urlMap.pathname.match(/^\/?(.*)$/)[1].replace('/', '_');
	var local = path.resolve('data/', urlMap.hostname, pathname);
	mkdirp(local, function(err) {
		if(err) {
			return callback(err);
		}
		var command = ['git clone', git.url, local].join(" ");
		debug("command=%s", command);
		exec(command, function(err, stdout, stderr) {
			callback(err || stderr, stdout);
		});
	});
	return git;
}

/**
 * 进入仓库根目录
 * @param callback(err)
 */
Git.prototype.enter = function(callback) {
	// TODO
	return this;
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
Git.prototype.log = function(commit, callback) {
	// TODO
	return this;
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