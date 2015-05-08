var Git = require('./git.js');
var debug = require('debug')('febu:' + __filename);
var path = require('path');
var fs = require('fs');
var async = require('async');
var util = require('./util.js');
var gulp = require('gulp');
var gulpIgnore = require('gulp-ignore');

function Dev(project) {
	this.project = project;
}

/**
 * 是否发布过此版本
 * @param  commit
 * @param  callback(err, boolean)
 */
Dev.prototype.exist = function(commit, callback) {
	var dev = this;

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
	});
};

// 收集静态资源
Dev.prototype.resource = function(source, callback) {
	debug('resource');
	var dev = this;
	gulp.task('resource', function(){
		var ignore = ['**/*.less', '**/*.md', '**/*.markdown', '**/*.+(shtml|html|htm)'];
		var src = util.getCwd(dev.project.repo, 'src');
		var dest = util.getCwd(dev.project.repo, 'dest');
		gulp.src(source, {
			base: src
		})
		.pipe(gulpIgnore.exclude(ignore))
		.pipe(gulp.dest(dest))
		.on('end', callback)
		.on('error', callback);
	});
	gulp.start('resource');
};

// 处理html文件
Dev.prototype.html = function(source, callback) {
	debug('html');
	// TODO 根据css, js收集变更的html文件
	// TODO 替换静态资源链接
	// TODO 输出到dest目录
	// TODO 标记该项目busy = false;
	callback();
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
			return dev.checkout(commit, callback);
		} else {
			// 签出源码 > 编译&输出 > 提交到版本库 > 标记为已发布
			var checkout = function() {
				debug('checkout ', arguments);
				var next = arguments[arguments.length - 1];
				async.waterfall([
					function(cb) {
						util.getProject(dev.project, commit, function(){
							cb();
						});
					},
					util.getSource.bind(null, dev.project, commit)
				], next);
			};

			var compile = function(source) {
				debug('compile ', arguments);
				var next = arguments[arguments.length - 1];
				async.series([
					function(cb) {
						dev.resource(source, cb);
					},
					function(cb){
						dev.html(source, cb);
					}
				], next);
			};

			var save = function(){
				debug('save ', arguments);
				var next = arguments[arguments.length - 1];
				dev.commit(next);
			};

			var getHeadCommit = function() {
				debug('getHeadCommit', arguments);
				var next = arguments[arguments.length - 1];
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
					next(null, args);
				});
			};

			var mark = function(data) {
				debug('mark', arguments);
				var next = arguments[arguments.length - 1];
				return next(null, {}); // 测试用
				// util.mark(dev.db, data, next);
			};

			var tasks = [checkout, compile, save, getHeadCommit, mark];
			async.waterfall(tasks, function(err, data){
				callback(err, data);
			});
		}
	});
};


module.exports = Dev;