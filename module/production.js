var path = require('path');
var fs = require('fs-extra');
var async = require('async');
var debug = require('debug')('febu:production.js');
var gulpFilter = require('gulp-filter');
var uglify = require('gulp-uglify');
var minifyCss = require('gulp-minify-css');
var rev = require('gulp-rev');
var _ = require('underscore');
var url = require('url');
var through2 = require('through2');
var gulp = require('gulp');
var del = require('del');
var plumber = require('gulp-plumber');
var File = require('vinyl');
var exec = require('child_process').exec;
var util = require('./util.js');
var common = require('./common.js');
var Git = require('./git.js');
var config = require('../config.js');

// 项目里有requirejs的构建脚本吗
var hasAMD;

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

	var conditions = {
		repo: p.project.repo,
		src: commit,
		type: 'production'
	};
	p.db.versions.find(conditions, function(err, ret) {
		if(err) {
			return callback(err);
		}

		var dest = ret ? ret.dest : null;
		callback(null, !!ret, dest);
	});
};

// 从生产环境的仓库里检出指定版本
Production.prototype.checkout = function(commit, callback) {
	debug('checkout=%o', commit);
	var p = this;
	var git = new Git(p.project.repo, {
		type: 'production'
	});
	git.checkout(commit, callback);
};

/**
 * 查找本次变化的文件
 * @param  commit
 * @param  callback(err, files)
 */
Production.prototype.getSource = function(commit, callback) {
	debug('getSource: %s', commit);

	var p = this;
	var git = new Git(p.project.repo);
    var src = common.getCwd(p.project.repo, 'src');

    // 取得上次发布的src版本号
    var getLatestVersion = function(cb) {
    	p.db.versions.find({
    		repo: p.project.repo,
    		type: 'production'
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

		var gitDiff = function(cb) {
			git.diff(srcCommit, commit, function(err, ret) {
	            if (err) {
	                return cb(err);
	            }

	            var source = [];
	            ret.forEach(function(item) {
	                source.push(item);
	            });

	            cb(null, source);
	        });
		};

		// 查找受影响的文件
		var getRelativeFiles = function(files, cb) {
			var conditions = {
				src: {
					'$in': files
				}
			};
			p.db.resources.find(conditions, function(err, ret) {
				if (err) {
	                return cb(err);
	            }

	            var list = [];
				ret.forEach(function(item) {
					list = list.concat(item.rel);
				});
				list = _.uniq(list);
				cb(null, list);
			});
		};


		// 查找两次即可找到所有的引用关系
		var find = function(files, cb) {
			getRelativeFiles(files, function(err, list) {
				if (err) {
	                return cb(err);
	            }
	            debug('第1次查找=%s', JSON.stringify(list, null, 4));
	            getRelativeFiles(list, function(err, list2) {
	            	if (err) {
		                return cb(err);
		            }
		            debug('第2次查找=%s', JSON.stringify(list2, null, 4));
		            files = files.concat(list, list2);
		            files = _.uniq(files);
		            debug('共找到文件=%s', JSON.stringify(files, null, 4));
		            cb(null, files);
	            });
			});
		};

		async.waterfall([gitDiff, find], callback);
    });
};

// 查询数据库的db.febu.resources，把结果放到Production实例的manifest属性里
Production.prototype.initManifest = function(callback) {
	var p = this;
	p.db.resources.find(null, function(err, docs) {
		if(err) {
			return callback(err);
		}
		docs.forEach(function(item) {
			delete item._id;
		});
		p.manifest = docs || [];
		callback(null, p.manifest);
	});
};

/**
 * 更新manifest属性
 * @param  {Object.<[repo], src, [dest], [rel]>} doc
 *                  src和rel的路径都是相对于仓库根目录
 * @return {Production}
 */
Production.prototype.updateManifest = function(doc) {
	var p = this;
	
	_.extend(doc, {
		repo: p.project.repo,
		_status: 'dirty' // serializeManifest方法会用到
	});

	doc.src = [].concat(doc.src);
	
	var findIt = _.find(p.manifest, function(item) {
		return _.isEqual(item.src, doc.src);
	});
	if(findIt) {
		if(doc.rel) {
			doc.rel = [].concat(doc.rel);
			doc.rel = _.union(findIt.rel, doc.rel);
		}
		_.extend(findIt, doc);
	} else {
		p.manifest.push(doc);
	}

	return p;
};

Production.prototype.updateManifestHelper = function (file, enc, cb) {
	var p = this;

	if(file.path !== 'rev-manifest.json') {
		return cb();
	}

	var manifest;

	try {
		manifest = JSON.parse(file.contents.toString());
		// debug('manifest=%s', file.contents.toString());
	} catch(err) {
		return cb(err);
	}

	var docs = []; // 方便做单元测试
	_.mapObject(manifest, function(value, key) {
		var dest = url.resolve(p.project.production.web, value);
		var doc = {
			src: key,
			dest: dest
		};
		docs.push(doc);
		p.updateManifest(doc);
	});
	cb && cb();
	return docs;
};

Production.prototype.serializeManifest = function(callback) {
	var p = this;
	
	// 把_status: 'dirty'的doc保存到数据库db.febu.resources里
	var todo = _.filter(p.manifest, function(item) {
		var isDirty = item._status === 'dirty';
		delete item._status;
		return isDirty;
	});
	p.db.resources.save(todo, callback);
};

/**
 * 取得一个静态资源的线上路径
 * @param {String | Array} filepath 文件路径（相对于项目根目录）
 * @return {String}
 */
Production.prototype.getFilePath = function(filepath) {
	var filepath = [].concat(filepath);
	var p = this;

	// TODO
};

Production.prototype.getBasename = function(filepath) {
	var ret = path.parse(filepath);
	return ret.base.slice(0, ret.base.length - ret.ext.length);
};

// 处理静态资源
Production.prototype.compileStaticFiles = function(files, callback) {
	// return callback(new Error('test compileStaticFiles error'));
	debug('处理静态资源');
	var p = this;

	var src = common.getCwd(p.project.repo, 'src');
	var base = hasAMD ? path.join(src, 'www') : src;
	var destRoot = common.getCwd(p.project.repo, 'production');
	var destStatic = path.join(destRoot, 'static');
	var build = common.getCwd(p.project.repo, 'build');

	/**
	 * 1. 除js, css的静态资源rev后输出到dest目录
	 * 2. 更新manifest
	 */
	var img = function(cb) {
		debug('img');

		var filterList = util.getStaticFileType();
		filterList = _.filter(filterList, function(item) {
			return (item !== '**/*.css') && (item !== '**/*.js');
		});
		var filter = gulpFilter(filterList);

		gulp.task('img', function() {
			return gulp.src(files, {
					base: base
				})
				.pipe(plumber(function (err) {
		            debug('出错: %s', err.message);
		            this.emit('end');
		        }))
				.pipe(filter)
				.pipe(rev())
				.pipe(gulp.dest(destStatic))
				.pipe(rev.manifest())
				.pipe(through2.obj(p.updateManifestHelper.bind(p)))
				.on('end', cb);
		});

		gulp.start('img');
	};

	gulp.task('clean', function() {		
		return del(build, {
			force: true
		});
	});

	/**
	 * 1. 替换静态资源内链（图片，字体...）-> build目录
	 * 2. build目录 -> min + rev -> dest目录
	 * 3. 更新manifest
	 */
	var css = function(cb) {
		debug('css');

		var filter = gulpFilter(['**/*.css']);

		gulp.task('build', ['clean'], function() {
			return gulp.src(files, {
					base: base
				})
				.pipe(filter)
				.pipe(through2.obj(util.replacePath(p, 'production'))) // 替换静态资源链接
				.pipe(gulp.dest(build));
		});

		gulp.task('css', ['build'], function() {
			return gulp.src('**/*.css', {
					base: build,
					cwd: build
				})
				.pipe(plumber(function (err) {
		            debug('出错: %s', err.message);
		            this.emit('end');
		        }))
				.pipe(minifyCss())
				.pipe(rev())
				.pipe(gulp.dest(destStatic))
				.pipe(rev.manifest())
				.pipe(through2.obj(p.updateManifestHelper.bind(p)))
				.on('end', cb);
		});

		gulp.start('css');
	};

	/**
	 * AMD
	 * 1. build目录：optimize=uglify, optimizeCss=none
	 * 2.1 build目录(所有.js) -> rev -> dest目录
	 * 2.2 更新manifest
	 * 3.1 config.js替换paths值 -> build目录 -> min + rev -> dest目录
	 * 3.2 更新manifest
	 *
	 * 非AMD
	 * 1. files -> rev -> dest目录
	 * 2. 更新manifest
	 */
	var js = function(cb) {
		debug('js');

		var amdAction = function(done) {
			var optimize = function(_cb) {
				var next = arguments[arguments.length - 1];
				var optimizerPath = path.join(config.amd.tools, config.amd.optimizer);
				var buildPath = path.join(config.amd.tools, config.amd.config);
				var command = ['node', optimizerPath, '-o', buildPath, 'optimize=uglify', 'optimizeCss=none'].join(' ');
		        exec(command, {cwd: src}, next);
		    };

		    var copy = function() {
		    	var next = arguments[arguments.length - 1];

		    	gulp.task('copy', function() {
		    		return gulp.src('**/*.js', {
			    			cwd: path.join(src, config.amd.build)
			    		})
		    			.pipe(plumber(function (err) {
				            debug('出错 第%d行: %s', err.lineNumber, err.message);
				            this.emit('end');
				        }))
	    				.pipe(rev())
						.pipe(gulp.dest(destStatic))
						.pipe(rev.manifest())
						.pipe(through2.obj(p.updateManifestHelper.bind(p)))
						.on('end', next);
		    	});

		    	gulp.start('copy');
		    };

		    var getConfigPath = function() {
		    	var next = arguments[arguments.length - 1];
		    	util.getConfigPath(p.project, next);
		    }

		    var updateConfig = function(configPath) {
		    	debug('updateConfig');
		    	var next = arguments[arguments.length - 1];

		    	var jsMap = _.filter(p.manifest, function(item) {
		    		var isJsFile = item.src[0].slice(-3) === '.js';
		    		return isJsFile;
		    	});

		    	var newPaths = _.map(jsMap, function(item) {
		    		var one = {};
		    		var file = new File({
		    			path: item.src[0]
		    		});
		    		var key = file.basename.slice(0, 0 - file.extname.length);
		    		var dest = item.dest.slice(0, -3); // 去掉扩展名
		    		one[key] = dest;
		    		return one;
		    	});

		    	return gulp.src(configPath, {
			    		base: base
			    	})
			    	.pipe(plumber(function (err) {
			            debug('出错 第%d行: %s', err.lineNumber, err.message);
			            this.emit('end');
			        }))
					.pipe(through2.obj(function (file, enc, cb) {
						var contents = file.contents.toString();
						util.replaceConfigPaths(contents, newPaths);
						cb();
					}))
					.pipe(uglify())
					.pipe(rev())
					.pipe(gulp.dest(destStatic))
					.pipe(rev.manifest())
					.pipe(through2.obj(p.updateManifestHelper.bind(p)))
					.pipe(gulp.dest(destStatic))
					.on('end', next);
		    };

		    var tasks = [optimize, copy, getConfigPath, updateConfig];
		    async.waterfall(tasks, done);
		};

		var otherAction = function(done) {
			var filter = gulpFilter(['**/*.js']);

			gulp.task('js', function() {
				return gulp.src(files, {
						base: base
					})
					.pipe(plumber(function (err) {
			            debug('出错 第%d行: %s', err.lineNumber, err.message);
			            this.emit('end');
			        }))
					.pipe(filter)
					.pipe(uglify())
					.pipe(rev())
					.pipe(gulp.dest(destStatic))
					.pipe(rev.manifest())
					.pipe(through2.obj(p.updateManifestHelper.bind(p)))
					.on('end', done);
			});

			gulp.start('js');
		};

		hasAMD ? amdAction(cb) : otherAction(cb);
	};

	async.series([img, css, js], function(err, results) {
		if(err) {
			return callback(err);
		}

		// 把files参数传递下去，方便async.waterfall的下个阶段使用
		callback(null, files);
	});
};

Production.prototype.replaceUrl = function(match, sub, file) {
	var p = this;
	sub = sub.trim();
	var isDataURI = sub.slice(0, 5) === 'data:';
	var protocol = url.parse(sub).protocol;
	if(isDataURI || protocol) {
		return match;
	} else {
		var subPath = util.relPath(file, sub);
		var doc = _.find(p.manifest, function(item) {
			return item.src[0] == subPath;
		});
		if(!doc) {
			return match;
		}
		var newSrc = doc.dest;
		// debug('replaceUrl: %s => %s', sub, newSrc);
		return ':url(' + newSrc + ')';
	}
};

// 处理模板文件
Production.prototype.compileVmFiles = function(files, callback) {
	// TODO
	debug('处理模板文件');
	var p = this;

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

	var commit = function(cb) {
		git.status(function(err, data) {
			debug('git.status=', data);
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
				debug('本次提交=%o', data);
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
		commit
	];

	async.series(tasks, callback);
};

Production.prototype.run = function(commit, callback) {
	var p = this;
	p.exist(commit, function(err, exist, destCommit) {
		if(err) {
			return callback(err);
		}
		if(exist) {
			debug('该版本%s已发布过，直接签出%s', commit, destCommit);
			return p.checkout(destCommit, callback);
		} else {
			debug('开始发布...');

			var checkAMD = function() {
				var next = arguments[arguments.length - 1];
				util.hasAMD(p.project, function(err, ret){
					hasAMD = ret;
					debug('hasAMD=', ret);
					next(err, ret);
				});
			};

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
				var next = arguments[arguments.length - 1];
				if(data.dest) {
					debug('mark', arguments);
					util.mark(p.db, data, next);
				} else {
					next();
				}
			};

			var tasks = [
				p.initManifest.bind(p), 
				checkAMD, checkout, compileStaticFiles, compileVmFiles,
				function() {
					var next = arguments[arguments.length - 1];
					p.serializeManifest(next);
				},
				save, getHeadCommit, mark
			];
			async.waterfall(tasks, function(err, data){
				callback(err, data);
			});
		}
	});
};

module.exports = Production;

