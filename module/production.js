var path = require('path');
var fs = require('fs');
var async = require('async');
var debug = require('debug')('febu:' + __filename);
var rename = require("gulp-rename");
var gulpFilter = require('gulp-filter');
var uglify = require('gulp-uglify');
var minifyCss = require('gulp-minify-css');
var replace = require('gulp-replace');
var util = require('./util.js');
var common = require('./common.js');
var Git = require('../module/git.js');

function Production(project) {
	this.project = project;
}

/**
 * 是否发布过此版本
 * @param  commit
 * @param  callback(err, boolean)
 */
Production.prototype.exist = function(commit, callback) {
	var p = this;

	var git = new Git(p.project.repo, {
		type: 'production'
	});
	var gitDir = path.join(git.options.cwd, '.git');
	fs.exists(gitDir, function(ret) {
		if(ret) {
			p.checkout('master', function(err, cb){
				if(err) {
					return callback(err);
				}
				var conditions = {
					repo: p.repo,
					src: commit
				};
				p.db.versions.find(conditions, function(err, ret) {
					if(err) {
						return callback(err);
					}
					if(!!ret) {
						debug('该版本已发布过，直接签出');
					}
					callback(null, !!ret);
				});
			});
		} else {
			callback(null, ret);
		}
	});
};

/**
 * 查找本次变化的文件
 * @param  commit
 * @param  callback(err, files)
 */
Production.prototype.getSource = function(commit, callback) {
	debug('getSource', arguments);
	
	var p = this;
	var git = new Git(p.project.repo);
    var src = common.getCwd(p.project.repo, 'src');

	if(p.project.version) {
		var gitDiff = function(cb) {
			git.diff(p.project.version, commit, function(err, ret) {
	            if (err) {
	                return cb(err);
	            }

	            var source = [];
	            ret.forEach(function(item) {
	                item = path.join(src, item);
	                source.push(item)
	            });

	            cb(null, source);
	        });
		};

		// 查找受影响的文件
		var getRelativeFiles = function(files, cb) {
			// TODO
		};

		async.waterfall([gitDiff, getRelativeFiles], callback);
	} else {
		callback(null, ['**/*']);
	}
};

/**
 * 取得一个静态资源的线上路径
 * @param {String | Array} filepath 文件路径（相对于项目根目录）
 * @return {Function(err, newFilePath)} callback
 */
Production.prototype.getFilePath = function(filepath, callback) {
	var filepath = [].concat(filepath);
	// TODO
	// 如果未查到，就向数据库里新插入一条记录
};

Production.prototype.getBasename = function(filepath) {
	var ret = path.parse(filepath);
	return = ret.base.slice(0, ret.base.length - ret.ext.length);
};

// 处理静态资源
Production.prototype.compileStaticFiles = function(files, callback) {
	debug('compileStaticFiles', arguments);

	var img = function(cb) {
		// TODO
	};


	var css = function(cb) {
		// TODO
	};

	var js = function(cb) {
		// TODO 考虑AMD情况
	};

	async.series([img, css, js], function(err, results) {
		if(err) {
			return callback(err);
		}

		// 把files参数传递下去，方便async.waterfall的下个阶段使用
		callback(null, files);
	});
};

// 处理模板文件
Production.prototype.compileVmFiles = function(files, callback) {
	// TODO
	debug('compileVmFiles', arguments);

	// 把files参数传递下去，方便async.waterfall的下个阶段使用
	callback(null, files);
};

// 把发布好的文件提交到目标仓库
Production.prototype.commit = function(message, callback) {
	debug('commit:%s', message);
	var p = this;

	var git = new Git(p.project.repo, {
		type: 'production'
	});

	var tasks = [
		function(cb) {
			// 首先确保已初始化仓库
			git.init(function(){
				cb();
			});
		},
		git.addAll.bind(git),
		git.commit.bind(git, message)
	];

	async.waterfall(tasks, callback);
};

Production.prototype.run = function(commit, callback) {
	var p = this;
	p.exist(commit, function(err, exist) {
		if(err) {
			return callback(err);
		}
		if(exist) {
			return p.checkout(commit, callback);
		} else {
			debug('开始发布...');

			var checkout = function() {
				debug('checkout');
				var next = arguments[arguments.length - 1];
				async.waterfall([
					function(cb) {
						util.getProject(p.project, commit, function() {
							cb();
						});
					},
					function(cb) {
						p.getSource(commit, cb);
					}
				], next);
			};

			var compileStaticFiles = function(files) {
				var next = arguments[arguments.length - 1];
				p.compileStaticFiles(files, next);
			};

			var compileVmFiles = function(files) {
				var next = arguments[arguments.length - 1];
				p.compileVmFiles(files, next);
			};

			var save = function(){
				debug('save');
				var next = arguments[arguments.length - 1];
				p.commit(commit, next);
			};

			var getHeadCommit = function() {
				debug('getHeadCommit');
				var next = arguments[arguments.length - 1];
				var git = new Git(p.project.repo, {
					type: 'production'
				});
				git.getHeadCommit(function(err, data) {
					var args = {
						type: 'production',
						src: commit,
						dest: data,
						repo: p.project.repo
					}
					next(null, args);
				});
			};

			var mark = function(data) {
				debug('mark', arguments);
				var next = arguments[arguments.length - 1];
				util.mark(p.db, data, next);
			};

			var tasks = [checkout, compileStaticFiles, compileVmFiles, save, getHeadCommit, mark];
			async.waterfall(tasks, function(err, data){
				callback(err, data);
			});
		}
	});
};

module.exports = Production;

