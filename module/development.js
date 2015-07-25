var debug = require('debug')('febu:' + __filename);
var path = require('path');
var url = require('url');
var fs = require('fs');
var async = require('async');
var gulp = require('gulp');
var replace = require('gulp-replace');
var gulpFilter = require('gulp-filter');
var dir = require('node-dir');
var through2 = require('through2');
var config = require('../config.js');
var Git = require('./git.js');
var util = require('./util.js');
var common = require('./common.js');

// 项目里有requirejs的构建脚本吗
var hasAMD;

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
				if(err) {
					return callback(err);
				}
				var conditions = {
					repo: dev.project.repo,
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
		var src = common.getCwd(dev.project.repo, 'src');
		src = hasAMD ? path.join(src, 'www') : src;
		var destRoot = common.getCwd(dev.project.repo, 'development');
		var dest = path.join(destRoot, 'static');
		gulp.src(source, {
			base: src
		})
		.pipe(gulpFilter(util.getStaticFileType()))
		.pipe(gulp.dest(dest))
		.on('end', callback)
		.on('error', callback);
	});
	gulp.start('resource');
};

Dev.prototype.replaceHref = function(attrs, match, file) {
	var dev = this;
	var href = attrs.filter(function(item){
		return /^href=/i.test(item);
	})[0];

	var replacement = function(match, sub) {
		var protocol = url.parse(sub).protocol;
		if(protocol) {
			return match;
		} else {
			var subPath = util.relPath(file, sub);
			var newHref = url.resolve(dev.project.development.web, subPath);
			return 'href="' + newHref + '"';
		}
	};

	if(/^href="/i.test(href)) {
		match = match.replace(/\bhref="([^"]+)"/i, replacement);
	} else if(/^href='/i.test(href)) {
		match = match.replace(/\bhref='([^']+)'/i, replacement);
	} else if(/^href=(?!["'])/i.test(href)) {
		match = match.replace(/\bhref=([^\s\\>]+)/i, replacement);
	}
	return match;
};

Dev.prototype.replaceSrc = function(attrs, match, file) {
	var dev = this;
	var src = attrs.filter(function(item){
		return /^src=/i.test(item);
	})[0];

	var replacement = function(match, sub) {
		sub = sub.trim();
		var isDataURI = sub.slice(0, 5) === 'data:';
		var protocol = url.parse(sub).protocol;
		if(isDataURI || protocol) {
			return match;
		} else {
			var subPath = util.relPath(file, sub);
			var newSrc = url.resolve(dev.project.development.web, subPath);
			return 'src="' + newSrc + '"';
		}
	};

	if(/^src="/i.test(src)) {
		match = match.replace(/\bsrc="([^"]+)"/i, replacement);
	} else if(/^src='/i.test(src)) {
		match = match.replace(/\bsrc='([^']+)'/i, replacement);
	} else if(/^src=(?!["'])/i.test(src)) {
		match = match.replace(/\bsrc=([^\s\\>]+)/i, replacement);
	}
	return match;
};

Dev.prototype.replaceData = function(attrs, match, file) {
	var dev = this;
	var src = attrs.filter(function(item){
		return /^data=/i.test(item);
	})[0];

	var replacement = function(match, sub) {
		var protocol = url.parse(sub).protocol;
		if(protocol === null) {
			var subPath = util.relPath(file, sub);
			var newSrc = url.resolve(dev.project.development.web, subPath);
			return 'data="' + newSrc + '"';
		} else {
			return match;
		}
	};

	if(/^data="/i.test(src)) {
		match = match.replace(/\bdata="([^"]+)"/i, replacement);
	} else if(/^data='/i.test(src)) {
		match = match.replace(/\bdata='([^']+)'/i, replacement);
	} else if(/^data=(?!["'])/i.test(src)) {
		match = match.replace(/\bdata=([^\s\\>]+)/i, replacement);
	}
	return match;
};

Dev.prototype.replaceUrl = function(match, sub, file) {
	var dev = this;
	sub = sub.trim();
	var isDataURI = sub.slice(0, 5) === 'data:';
	var protocol = url.parse(sub).protocol;
	if(isDataURI || protocol) {
		return match;
	} else {
		var subPath = util.relPath(file, sub);
		var newSrc = url.resolve(dev.project.development.web, subPath);
		return ':url(' + newSrc + ')';
	}
};

// 处理html文件
Dev.prototype.html = function(source, callback) {
	debug('html');
	var dev = this;
		
	gulp.task('html', function(){
		var src = common.getCwd(dev.project.repo, 'src');
		src = hasAMD ? path.join(src, 'www') : src;
		var destRoot = common.getCwd(dev.project.repo, 'development');
		var dest = path.join(destRoot, 'vm');
		console.log('输出模板：%s', dest);
		gulp.src(source, {
			base: src
		})
		.pipe(gulpFilter(util.getVmFileType()))
		.pipe(through2.obj(util.replacePath(dev, 'development'))) // 替换静态资源链接
		.pipe(gulp.dest(dest))
		.on('end', callback)
		.on('error', callback);
	});
	gulp.start('html');
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
 */
Dev.prototype.commit = function(message, callback) {
	debug('commit');
	var dev = this;

	var git = new Git(dev.project.repo, {
		type: 'development'
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

// 替换config.js里的paths
Dev.prototype.buildConfigFile = function(callback) {
	var dev = this;
	util.getConfigPath(dev.project, function(err, configPath) {
		if(err) {
			return callback(err);
		}

		var newPaths = {};

		gulp.task('build', function() {
			var destRoot = common.getCwd(dev.project.repo, 'development');
			var dest = path.join(destRoot, 'static');
			gulp.src(configPath, {
					base: path.join(src, config.amd.www)
				})
				.pipe(replace(/^[\s\S]*$/g, function(match) {
					return util.replaceConfigPaths(match, newPaths);
				}, {
					skipBinary: true
				}))
				.pipe(gulp.dest(dest))
				.on('end', callback)
				.on('error', callback);
		});

		var src = common.getCwd(dev.project.repo, 'src');
		var www = path.join(src, config.amd.www);
		dir.readFiles(www,
			{ match: /.js$/ }, 
			function(err, content, next) {
				if(err) throw err;
				next();
			},
			function(err, files) {
				if(err) {
					return callback(err);
				}

				var webRoot = dev.project.development.web;
				files.forEach(function(file) {
					var fileName = path.parse(file).name;
					var filePath = path.relative(www, file);
					var newFilePath = url.resolve(webRoot, filePath);
					newFilePath = newFilePath.match(/(.+).js$/)[1]; // 去掉扩展名
					newPaths[fileName] = newFilePath;
				});
				gulp.start('build');	
			}
		);
	});
};

Dev.prototype.run = function(commit, callback) {
	var dev = this;
	dev.exist(commit, function(err, exist) {
		if(err) {
			return callback(err);
		}
		if(exist) {
			debug('该版本已发布过，直接签出');
			return dev.checkout(commit, callback);
		} else {
			debug('开始发布...');
			// 签出源码 > 编译&输出 > 提交到版本库 > 标记为已发布
			
			var checkAMD = function() {
				var next = arguments[arguments.length - 1];
				util.hasAMD(dev.project, function(err, ret){
					hasAMD = ret;
					debug('hasAMD=', ret);
					next(err, ret);
				});
			};

			var checkout = function() {
				debug('checkout ', arguments);
				var next = arguments[arguments.length - 1];
				async.waterfall([
					function(cb) {
						util.getProject(dev.project, commit, function() {
							cb();
						});
					},
					util.getSource.bind(null, dev.project, commit)
				], next);
			};

			var compile = function(source) {
				debug('compile ', arguments);
				var next = arguments[arguments.length - 1];
				var destRoot = common.getCwd(dev.project.repo, 'development');
				var dest = path.join(destRoot, 'static');
				console.log('输出静态资源：%s', dest);
				async.series([
					function(cb) {
						dev.resource(source, cb);
					},
					function(cb) {
						util.runAMD(dev.project, dest, cb);
					},
					function(cb) {
						dev.buildConfigFile(cb);
					},
					function(cb){
						dev.html(source, cb);
					}
				], next);
			};

			var save = function(){
				debug('save');
				var next = arguments[arguments.length - 1];
				dev.commit(commit, next);
			};

			var getHeadCommit = function() {
				debug('getHeadCommit');
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
				util.mark(dev.db, data, next);
			};

			var tasks = [checkAMD, checkout, compile, save, getHeadCommit, mark];
			async.waterfall(tasks, function(err, data){
				callback(err, data);
			});
		}
	});
};

module.exports = Dev;