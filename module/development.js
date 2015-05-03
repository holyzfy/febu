var Git = require('./git.js');
var debug = require('debug')('febu:' + __filename);
var path = require('path');
var fs = require('fs');
var async = require('async');
var util = require('./util.js');

function Dev(project) {
	this.project = project;
}

/**
 * 是否发布过此版本
 * @param  commit
 * @param  callback(err, boolean)
 */
Dev.prototype.exist = function(commit, callback) {
	return callback(null, false);
	/*var dev = this;

	var git = new Git(dev.project.repo, {
		type: 'development'
	});
	var gitDir = path.join(git.options.cwd, '.git');
	fs.exists(gitDir, function(ret) {
		if(ret) {
			dev.checkout('master', function(err, cb){
				debug('exist');
				if(err) {
					return callback(err);
				}
				var conditions = {
					repo: dev.repo,
					src: commit
				};
				dev.db.versions.find(conditions, function(err, ret) {
					if(err) {
						return callback(err);
					}
					callback(null, !!ret);
				});
			});
		} else {
			callback(null, ret);
		}
	});*/
};

// 收集静态资源
Dev.prototype.resource = function(source, callback) {
	// TODO 输出到dest目录
	debug('resource');
	callback(); // 测试
};

// 处理html文件
Dev.prototype.html = function(source, callback) {
	debug('html');
	// TODO 替换静态资源链接
	// TODO 输出到dest目录
	// TODO 标记该项目busy = false;
	callback(); // 测试
}

// 从测试环境的仓库里检出指定版本
Dev.prototype.checkout = function(commit, callback) {
	debug('checkout ', commit);
	var dev = this;
	var git = new Git(dev.project.repo, {
		type: 'development'
	});
	git.checkout(commit, callback);
};

/**
 * 把发布好的文件提交到目标仓库
 * @param  callback(err, commit) commit对应目标仓库的版本号
 */
Dev.prototype.commit = function(callback) {
	// TODO
	debug('commit');
	callback(); // 测试
};

Dev.prototype.run = function(commit, callback) {
	var dev = this;
	dev.exist(commit, function(err, exist) {
		if(err) {
			return callback(err);
		}
		if(exist) {
			dev.checkout(commit, callback);
		} else {
			// 签出源码 > 编译&输出 > 提交到版本库 > 标记为已发布
			var checkout = function(cb) {
				debug('checkout ', arguments);
				async.waterfall([
					function(_cb) {
						util.getProject(dev.project, commit, function(){
							_cb();
						});
					},
					util.getSource.bind(null, dev.project, commit)
				], cb);
			};

			var compile = function(source, cb) {
				debug('compile ', arguments);
				async.series([
					function(_cb) {
						dev.resource(source, _cb);
					},
					function(_cb){
						dev.html(source, _cb);
					}
				], function(){
					cb();
				});
			};

			var save = function(cb){
				debug('save ', arguments);
				dev.commit(cb);
			};

			var getHeadCommit = function(cb) {
				debug('getHeadCommit', arguments);
				var git = new Git(dev.project.repo, {
					type: 'development'
				});
				git.getHeadCommit(function(err, data) {
					var args = {
						type: 'development',
						src: commit,
						dest: data,
						repo: dev.project.repo
					}
					cb(null, args);
				});
			};

			var mark = function(data, cb) {
				debug('mark', arguments);
				// util.mark(dev.db, data, cb);
			};

			var tasks = [checkout, compile, save, getHeadCommit, mark];
			async.waterfall(tasks, callback);
			
		}
	});
};


module.exports = Dev;