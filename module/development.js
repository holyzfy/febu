var debug = require('debug')('febu:development.js');
var path = require('path');
var url = require('url');
var fs = require('fs');
var async = require('async');
var gulp = require('gulp');
var gulpFilter = require('gulp-filter');
var dir = require('node-dir');
var through2 = require('through2');
var _ = require('underscore');
var plumber = require('gulp-plumber');
var exec = require('child_process').exec;
var File = require('vinyl');
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
 * @param  callback(err, Boolean)
 */
Dev.prototype.exist = function(commit, callback) {
	var dev = this;

	var conditions = {
		repo: dev.project.repo,
		src: commit,
		type: 'development'
	};
	dev.db.versions.find(conditions, function(err, ret) {
		if(err) {
			return callback(err);
		}

		var dest = ret ? ret.dest : null;
		callback(null, !!ret, dest);
	});
};

// 从测试环境的仓库里检出指定版本
Dev.prototype.checkout = function(commit, callback) {
	debug('checkout ', commit);
	var dev = this;
	var git = new Git(dev.project.repo, {
		type: 'development'
	});
	git.checkout(commit, callback);
};

// 收集要处理的文件列表
Dev.prototype.getSource = function(commit, callback) {
	var dev = this;
    var files = [];
    var git = new Git(dev.project.repo);
    var src = common.getCwd(dev.project.repo, 'src');

    // 取得上次发布的src版本号
    var getLatestVersion = function(cb) {
    	dev.db.versions.find({
    		repo: dev.project.repo,
    		type: 'development'
    	}, function(err, ret) {
		 	if (err) {
                return cb(err);
            }
    		
    		var srcCommit = ret ? ret.src : null;
    		debug('上次发布的版本号=%s', srcCommit);
    		cb(null, srcCommit);
    	});
    };

    getLatestVersion(function(err, srcCommit) {
    	if (err) {
            return callback(err);
        }

    	if(!srcCommit) {
    		return callback(null, ['**/*']);
    	}

    	git.diff(srcCommit, commit, function(err, ret) {
    		debug('diff ret=', ret);
            if (err) {
                return callback(err);
            }

            ret.forEach(function(item) {
            	if(item && item.length > 0) {
	                item = path.join(src, item);
	                files.push(item);
            	}
            });
            callback(null, files);
        });
    });
};

// 收集静态资源
Dev.prototype.resource = function(files, callback) {
	debug('resource');
	var dev = this;
	gulp.task('resource', function(){
		var src = common.getCwd(dev.project.repo, 'src');
		src = hasAMD ? path.join(src, config.amd.www) : src;
		var destRoot = common.getCwd(dev.project.repo, 'development');
		var destStatic = path.join(destRoot, 'static');
		console.log('输出静态资源：%s', destStatic);
		gulp.src(files, {
			base: src
		})
		.pipe(plumber(function (err) {
            debug('出错 第%d行: %s', err.lineNumber, err.message);
            this.emit('end');
        }))
		.pipe(gulpFilter(util.getStaticFileType()))
		.pipe(gulp.dest(destStatic))
		.on('end', callback);
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

Dev.prototype.js = function(files, callback) {
	var dev = this;
	var src = common.getCwd(dev.project.repo, 'src');
	var base = hasAMD ? path.join(src, config.amd.www) : src;
	var destRoot = common.getCwd(dev.project.repo, 'development');
	var destStatic = path.join(destRoot, 'static');

	var amdAction = function(done) {
		// 本次发布有变更的js文件吗
		var hasJsFiles = _.some(files, function(item) {
			return (item === '**/*') || (item.slice(-3) === '.js');
		});
		if(!hasJsFiles) {
			debug('本次无变更的js');
			return done();
		}

		var newPaths = {};

		var optimize = function() {
			var next = arguments[arguments.length - 1];
			var optimizerPath = path.join(config.amd.tools, config.amd.optimizer);
			var buildPath = path.join(config.amd.tools, config.amd.config);
			var command = ['node', optimizerPath, '-o', buildPath, 'optimize=none', 'optimizeCss=none'].join(' ');
	        exec(command, {cwd: src}, next);
	    };

	    var copy = function() {
	    	var next = arguments[arguments.length - 1];

    		gulp.task('copy', function() {
	    		var build = path.join(src, config.amd.build);
	    		return gulp.src('**/*.js', {
		    			cwd: build
		    		})
	    			.pipe(plumber(function (err) {
			            debug('出错 第%d行: %s', err.lineNumber, err.message);
			            this.emit('end');
			        }))
			        .pipe(through2.obj(function (file, enc, cb) {
						file = new File(file);

						if(file.isNull()) {		
				            return cb(null, file);		
				        }

						var filePath = path.relative(build, file.path);
						var newFilePath = url.resolve(dev.project.development.web, filePath);
						newFilePath = newFilePath.match(/(.+).js$/)[1]; // 去掉扩展名
						newPaths[file.basename] = newFilePath;
						cb(null, file);
					}))
					.pipe(gulp.dest(destStatic))
					.on('end', next);
    		});
    		
    		gulp.start('copy');
	    };

	    var getConfigPath = function() {
	    	var next = arguments[arguments.length - 1];
	    	util.getConfigPath(dev.project, next);
	    }

	    var updateConfig = function(configPath) {
	    	debug('updateConfig');
	    	var next = arguments[arguments.length - 1];

	    	return gulp.src(configPath, {
		    		base: base
		    	})
		    	.pipe(plumber(function (err) {
		            debug('出错 第%d行: %s', err.lineNumber, err.message);
		            this.emit('end');
		        }))
				.pipe(through2.obj(function (file, enc, cb) {
					file = new File(file);

					if(file.isNull()) {		
			            return cb(null, file);		
			        }
			        
					var contents = file.contents.toString();
					var result = util.replaceConfigPaths(contents, newPaths);
					file.contents = new Buffer(result);
					cb(null, file);
				}))
				.pipe(gulp.dest(destStatic))
				.on('end', next);
	    };

		var tasks = [optimize, copy, getConfigPath, updateConfig];
	    async.waterfall(tasks, done);
	};

	var otherAction = function(done) {
		done();
	};
	hasAMD ? amdAction(callback) : otherAction(callback);
};

// 处理html文件
Dev.prototype.html = function(files, callback) {
	debug('html');
	var dev = this;
		
	gulp.task('html', function(){
		var src = common.getCwd(dev.project.repo, 'src');
		src = hasAMD ? path.join(src, config.amd.www) : src;
		var destRoot = common.getCwd(dev.project.repo, 'development');
		var dest = path.join(destRoot, 'vm');
		console.log('输出模板：%s', dest);
		gulp.src(files, {
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

// 把发布好的文件提交到目标仓库
Dev.prototype.commit = function(message, callback) {
	debug('commit');
	var dev = this;

	var git = new Git(dev.project.repo, {
		type: 'development'
	});

	var commit = function(cb) {
		git.status(function(err, data) {
			if(err) {
				return cb(err);
			}

			if(!data) {
				debug('本次无提交');
				return cb();
			}

			git.addAll(function(err) {
				if(err) {
					return cb(data);
				}
				debug('本次提交：', data);
				git.commit(message, cb);
			});
		});
	};

	var tasks = [
		function(cb) {
			// 首先确保已初始化仓库
			git.init(function(){
				cb();
			});
		},
		git.checkout.bind(git, 'master'),
		commit
	];

	async.series(tasks, callback);
};

Dev.prototype.run = function(commit, callback) {
	var dev = this;
	dev.exist(commit, function(err, exist, destCommit) {
		if(err) {
			return callback(err);
		}
		if(exist) {
			console.log('版本%s已发布过，直接签出%s', commit, destCommit);
			return dev.checkout(destCommit, function(err) {
				if(err) {
					return callback(err);
				}

				var destRoot = common.getCwd(dev.project.repo, 'development');
				var destStatic = path.join(destRoot, 'static');
				var destVm = path.join(destRoot, 'vm');

				console.log('输出静态资源：%s', destStatic);
				console.log('输出模板：%s', destVm);

				callback();
			});
		} else {
			debug('开始发布...');
			// 签出源码 > 编译&输出 > 提交到版本库 > 标记为已发布
			
			var checkAMD = function() {
				var next = arguments[arguments.length - 1];
				util.hasAMD(dev.project, function(err, ret){
					hasAMD = ret;
					debug('hasAMD=%o', ret);
					next(err, ret);
				});
			};

			var checkout = function() {
				debug('checkout:%s', commit);
				var next = arguments[arguments.length - 1];
				async.waterfall([
					function(cb) {
						util.getProject(dev.project, commit, function() {
							cb();
						});
					},
					dev.getSource.bind(dev, commit)
				], next);
			};

			var compile = function(files) {
				debug('compile', files);
				var next = arguments[arguments.length - 1];
				var tasks = [
					dev.resource.bind(dev, files),
					dev.js.bind(dev, files),
					dev.html.bind(dev, files)
				];
				async.series(tasks, next);
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