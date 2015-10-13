var path = require('path');
var fs = require('fs-extra');
var async = require('async');
var debug = require('debug')('febu:production.js');
var gulpFilter = require('gulp-filter');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var minifyCss = require('gulp-minify-css');
var rev = require('gulp-rev');
var _ = require('underscore');
var url = require('url');
var through2 = require('through2');
var gulp = require('gulp');
var gulpif = require('gulp-if');
var del = require('del');
var plumber = require('gulp-plumber');
var File = require('vinyl');
var file = require('read-file');
var exec = require('child_process').exec;
var util = require('./util.js');
var common = require('./common.js');
var Git = require('./git.js');
var config = require('config');

// 项目里有requirejs的构建脚本吗
var hasAMD;

function Production(project) {
	this.project = project;
}

/**
 * 是否发布过此版本
 * @param  commit
 * @param  callback(err, {Boolean} exist, destCommit)
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

		var keys = ['src', 'repo', 'dest', 'rel'];
		docs.forEach(function(item) {
			item = _.pick(item, keys);
		});
		p.manifest = docs || [];
		callback(null, p.manifest);
	});
};

/**
 * 更新manifest属性
 * @param  {Object.<[repo], src, [dest], [rel]>} doc
 *                  src和rel的路径都是相对于项目根目录
 * @return {Production}
 */
Production.prototype.updateManifest = function(doc) {
	var p = this;

	var findIt;
	
	_.extend(doc, {
		repo: p.project.repo,
		_status: 'dirty' // serializeManifest方法会用到
	});

	doc.src = [].concat(doc.src);

	if(doc._group) {
		findIt = _.find(p.manifest, function(item) {
			return (item._group === doc._group) && (item._type === doc._type) && _.isEqual(item.rel, doc.rel);
		});
	} else {
		findIt = _.find(p.manifest, function(item) {
			return _.isEqual(item.src, doc.src)
		});
	}
	
	if(findIt) {
		if(doc.rel) {
			doc.rel = [].concat(doc.rel);
			doc.rel = _.union(findIt.rel, doc.rel);
		}
		doc.src = _.union(findIt.src, doc.src);
		_.extend(findIt, doc);
	} else {
		p.manifest.push(doc);
	}

	return p;
};

Production.prototype.updateManifestHelper = function (file, enc, cb) {
	var p = this;

	file = new File(file);

	if(file.isNull()) {		
        return cb(null, file);		
    }
    
	if(file.path !== 'rev-manifest.json') {
		return cb(null, file);
	}

	var manifest;

	try {
		manifest = JSON.parse(file.contents.toString());
		// debug('updateManifestHelper manifest=%s', file.contents.toString());
	} catch(err) {
		return cb(err, file);
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
	cb && cb(null, file);
	return docs;
};

Production.prototype.serializeManifest = function(callback) {
	var p = this;
	
	// 把_status: 'dirty'的doc保存到数据库db.febu.resources里
	var list = [];
	var keys = ['src', 'repo', 'dest', 'rel'];

	p.manifest.forEach(function(item) {
		var isDirty = (item._status === 'dirty');
		var one = _.pick(item, keys);
		isDirty && list.push(one);
	});

	// debug('serializeManifest=', list);
	
	p.db.resources.save(list, callback);
};

Production.prototype.getBasename = function(filepath) {
	var ret = path.parse(filepath);
	return ret.base.slice(0, ret.base.length - ret.ext.length);
};

// 处理静态资源
Production.prototype.compileStaticFiles = function(files, callback) {
	debug('处理静态资源');
	var p = this;

	var src = common.getCwd(p.project.repo, 'src');
	var base = hasAMD ? path.join(src, config.amd.www) : src;
	var destRoot = common.getCwd(p.project.repo, 'production');
	var destStatic = path.join(destRoot, 'static');
	var build = common.getCwd(p.project.repo, 'build');
	var ignoreList = util.getIgnore(base);
	var filterList = util.getStaticFileType().concat(ignoreList);

	/**
	 * 1. 除js, css的静态资源rev后输出到dest目录
	 * 2. 更新manifest
	 */
	var img = function(cb) {
		debug('img');

		var imgFilterList = _.filter(filterList, function(item) {
			return (item !== '**/*.css') && (item !== '**/*.js');
		});

		gulp.task('img', function() {
			return gulp.src(files, {
					base: base
				})
				.pipe(plumber(function (err) {
		            debug('task img出错: %s', err.message);
		            this.emit('end', err);
		        }))
				.pipe(gulpFilter(imgFilterList))
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

		var filterList = ['**/*.css'].concat(ignoreList);

		gulp.task('build', ['clean'], function() {
			return gulp.src(files, {
					base: base
				})
				.pipe(plumber(function (err) {
		            debug('task build出错: %s', err.message);
		            this.emit('end', err);
		        }))
				.pipe(gulpFilter(filterList))
				.pipe(through2.obj(util.replacePath(p, 'production'))) // 替换静态资源链接
				.pipe(gulp.dest(build));
		});

		gulp.task('css', ['build'], function() {
			return gulp.src('**/*.css', {
					base: build,
					cwd: build
				})
				.pipe(plumber(function (err) {
		            debug('task css出错: %s', err.message);
		            this.emit('end', err);
		        }))
		        .pipe(gulpFilter(filterList))
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

			// 本次发布有变更的js文件吗
			var hasJsFiles = _.some(files, function(item) {
				return (item === '**/*') || (item.slice(-3) === '.js');
			});
			if(!hasJsFiles) {
				debug('本次无变更的js');
				return done();
			}

			var optimize = function() {
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
				            debug('task copy出错 第%d行: %s', err.lineNumber, err.message);
				            this.emit('end', err);
				        }))
				        .pipe(gulpFilter(filterList))
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
		    	var newPaths = {};
		    	_.each(jsMap, function(item) {
		    		var file = new File({
		    			path: item.src[0]
		    		});
		    		var key = file.basename.slice(0, -3); // 去掉扩展名
		    		var dest = item.dest.slice(0, -3);
		    		newPaths[key] = dest;
		    	});

		    	gulp.task('updateConfig', function() {
			    	return gulp.src(configPath, {
				    		base: base
				    	})
				    	.pipe(plumber(function (err) {
				            debug('task updateConfig出错 第%d行: %s', err.lineNumber, err.message);
				            this.emit('end', err);
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
						.pipe(uglify())
						.pipe(rev())
						.pipe(gulp.dest(destStatic))
						.pipe(rev.manifest())
						.pipe(through2.obj(p.updateManifestHelper.bind(p)))
						.on('end', next);
		    	});

		    	gulp.start('updateConfig');
		    };

		    var tasks = [optimize, copy, getConfigPath, updateConfig];
		    async.waterfall(tasks, done);
		};

		var otherAction = function(done) {
			var filterList = ['**/*.js'].concat(ignoreList);

			gulp.task('js', function() {
				return gulp.src(files, {
						base: base
					})
					.pipe(plumber(function (err) {
			            debug('task js出错 第%d行: %s', err.lineNumber, err.message);
			            this.emit('end', err);
			        }))
					.pipe(gulpFilter(filterList))
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
		console.log('输出静态资源：%s', destStatic);
		// 把files参数传递下去，方便async.waterfall的下个阶段使用
		callback(err, files);
	});
};

function replaceHelper(doc, file) {
	doc.rel = doc.rel || [];
	var relative = getRelative(file);
	var relExisted = _.contains(doc.rel, relative);
	if(!relExisted) {
		doc.rel.push(relative);
		doc._status = 'dirty';
	}
}

function getRelative(file) {
	return file.relative.replace(new RegExp('\\' + path.sep, 'g'), '/');
}

Production.prototype.getGroup = function(group) {
	return group.match(/^_group='?"?([^'"]+)'?"?$/i)[1];
};

Production.prototype.replaceHref = function(attrs, match, file) {
	var p = this;
	
	var href = attrs.filter(function(item){
		return /^href=/i.test(item);
	})[0];

	if(!href) {
		return match;
	}

	var hrefValue = (href.match(/^href='?"?([^'"]+)'?"?$/i) || '')[1];
	if(!hrefValue) {
		return match;
	}

	var inline = attrs.filter(function(item) {
		return /^_inline=?$/i.test(item);
	})[0];

	if(inline) {
		if(p._singleDone) {
			var compress = attrs.filter(function(item){
				return /^_compress=?$/i.test(item);
			})[0];
			return p.styleInline(hrefValue, compress);
		} else {
			return match;
		}
	}

	var group = attrs.filter(function(item) {
		return /^_group=/i.test(item);
	})[0];

	if(group) {
		var groupValue = p.getGroup(group);

		if(!p._singleDone) {
			// 收集_group信息
			var doc = {
				src: hrefValue,
				_group: groupValue,
				_type: 'css'
			};
			replaceHelper(doc, file);
			p.updateManifest(doc);
			return match;
		} else {
			// 替换_group
			var relative = getRelative(file);
			var findIt = _.find(p.manifest, function(item) {
				var match = item.dest.match(/\/(\w+)-\w+\.group\.css$/) || [];
				var groupName = match[1];
				return (groupName === groupValue) && _.contains(item.rel, relative);
			});

			if(!findIt) {
				return match;
			}
			
			findIt._groupDone = findIt._groupDone || {};

			if(findIt._groupDone[relative]) { // 已替换过
				return '';
			} else {
				findIt._groupDone[relative] = true; // 标记为已替换
				var link = '<link rel="stylesheet" href="' + findIt.dest + '" />';
				return link;
			}

			return match;
		}
	}

	var replacement = function(match, sub) {
		var protocol = url.parse(sub).protocol;
		if(protocol) {
			return match;
		} else {
			var subPath = util.relPath(file, sub);
			var doc = _.find(p.manifest, function(item) {
				return item.src[0] == subPath;
			});
			if(!doc) {
				return match;
			}
			
			replaceHelper(doc, file);
			var newHref = doc.dest;
			return 'href="' + newHref + '"';
		}
	};

	if(/^href="/i.test(href)) {
		match = match.replace(/\bhref="([^"]+)"/i, replacement);
	} else if(/^href='/i.test(href)) {
		match = match.replace(/\bhref='([^']+)'/i, replacement);
	} else if(/^href=(?!["'])/i.test(href)) {
		match = match.replace(/\bhref=([^\s\>]+)/i, replacement);
	}
	return match;
};

/**
 * 处理<link>样式表的_inline和_compress标记
 * @param cssPath 相对于项目根目录的路径
 * @param {Boolean} compress 是否要压缩
 * @return 返回替换后的内容（含style标签）
 */
Production.prototype.styleInline = function(cssPath, compress) {
	var p = this;
	var src = common.getCwd(p.project.repo, 'src');
	var base = hasAMD ? path.join(src, config.amd.www) : src;
	var fullPath;
	if(compress) {
		var findIt = _.find(p.manifest, function(item) {
			return _.isEqual(item.src, [cssPath]);
		});
		if(findIt) {
			var minCssPath = findIt.dest.slice(p.project.production.web.length);
			var destRoot = common.getCwd(p.project.repo, 'production');
			fullPath = path.join(destRoot, 'static', minCssPath);
		} else {
			console.error('出错：未找到%s对应的压缩文件', cssPath);
		}
	} else {
		fullPath = path.join(base, cssPath);
	}

	var content = '';
	try {
		content = file.readFileSync(fullPath, 'utf8');
	} catch(err) {
		console.error('处理<link>样式表的_inline和_compress标记出错：', err.message);
	}
	return '<style>' + content + '</style>';
};

/**
 * 处理<script>的_inline和_compress标记
 * @param jsPath 相对于项目根目录的路径
 * @param {Boolean} compress 是否要压缩
 * @return 返回替换后的内容（含script标签）
 */
Production.prototype.scriptInline = function(jsPath, compress) {
	var p = this;
	var src = common.getCwd(p.project.repo, 'src');
	var base = hasAMD ? path.join(src, config.amd.www) : src;
	var fullPath;
	if(compress) {
		var findIt = _.find(p.manifest, function(item) {
			return _.isEqual(item.src, [jsPath]);
		});
		if(findIt) {
			var minJsPath = findIt.dest.slice(p.project.production.web.length);
			var destRoot = common.getCwd(p.project.repo, 'production');
			fullPath = path.join(destRoot, 'static', minJsPath);
		} else {
			console.error('出错：未找到%s对应的压缩文件', jsPath);
		}
	} else {
		fullPath = path.join(base, jsPath);
	}

	var content = '';
	try {
		content = file.readFileSync(fullPath, 'utf8');
	} catch(err) {
		console.error('处理脚本_inline和_compress标记出错：', err.message);
	}
	return '<script>' + content + '</script>';
};

Production.prototype.replaceSrc = function(attrs, match, file) {
	var p = this;

	var src = attrs.filter(function(item){
		return /^src=/i.test(item);
	})[0];

	if(!src) {
		return match;
	}

	var srcValue = (src.match(/^src='?"?([^'"]+)'?"?$/i) || '')[1];
	if(!srcValue) {
		return match;
	}

	var inline = attrs.filter(function(item) {
		return /^_inline=?$/i.test(item);
	})[0];

	var isScript = /^<script\s/i.test(match);

	if(isScript && inline) {
		if(p._singleDone) {
			var compress = attrs.filter(function(item){
				return /^_compress=?$/i.test(item);
			})[0];
			return p.scriptInline(srcValue, compress);
		} else {
			return match;
		}
	}

	var group = attrs.filter(function(item) {
		return /^_group=/i.test(item);
	})[0];

	if(isScript && group) {
		var groupValue = p.getGroup(group);

		if(!p._singleDone) {
			// 收集_group信息
			var doc = {
				src: srcValue,
				_group: groupValue,
				_type: 'js'
			};
			replaceHelper(doc, file);
			p.updateManifest(doc);
			return match;
		} else {
			// 替换_group
			var relative = getRelative(file);
			var findIt = _.find(p.manifest, function(item) {
				var match = item.dest.match(/\/(\w+)-\w+\.group\.js$/) || [];
				var groupName = match[1];
				return (groupName === groupValue) && _.contains(item.rel, relative);
			});

			if(!findIt) {
				return match;
			}
			
			findIt._groupDone = findIt._groupDone || {};

			if(findIt._groupDone[relative]) { // 已替换过
				return '';
			} else {
				findIt._groupDone[relative] = true; // 标记为已替换
				var script = '<script src="' + findIt.dest + '"></script>';
				return script;
			}

			return match;
		}
	}

	var replacement = function(match, sub) {
		var protocol = url.parse(sub).protocol;
		if(protocol) {
			return match;
		} else {
			var subPath = util.relPath(file, sub);
			var doc = _.find(p.manifest, function(item) {
				return item.src[0] == subPath;
			});
			if(!doc) {
				return match;
			}

			replaceHelper(doc, file);

			var newSrc = doc.dest;
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

Production.prototype.replaceData = function(attrs, match, file) {
	var p = this;
	var data = attrs.filter(function(item){
		return /^data=/i.test(item);
	})[0];

	var replacement = function(match, sub) {
		var protocol = url.parse(sub).protocol;
		if(protocol) {
			return match;
		} else {
			var subPath = util.relPath(file, sub);
			var doc = _.find(p.manifest, function(item) {
				return item.src[0] == subPath;
			});
			if(!doc) {
				return match;
			}

			replaceHelper(doc, file);
			var newData = doc.dest;
			return 'data="' + newData + '"';
		}
	};

	if(/^data="/i.test(data)) {
		match = match.replace(/\bdata="([^"]+)"/i, replacement);
	} else if(/^data='/i.test(data)) {
		match = match.replace(/\bdata='([^']+)'/i, replacement);
	} else if(/^data=(?!["'])/i.test(data)) {
		match = match.replace(/\bdata=([^\s\\>]+)/i, replacement);
	}
	return match;
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

		replaceHelper(doc, file);
		var newSrc = doc.dest;
		// debug('replaceUrl: %s => %s', sub, newSrc);
		return ':url(' + newSrc + ')';
	}
};

// 处理模板文件
Production.prototype.compileVmFiles = function(files, callback) {
	debug('处理模板文件');
	var p = this;
	var src = common.getCwd(p.project.repo, 'src');
	var base = hasAMD ? path.join(src, config.amd.www) : src;
	var destRoot = common.getCwd(p.project.repo, 'production');
	var destStatic = path.join(destRoot, 'static');
	var destVm = path.join(destRoot, 'vm');

	var ignoreList = util.getIgnore(base);
	var filterList = util.getVmFileType().concat(ignoreList);

	// 处理单个静态外链
	var single = function(done) {
		gulp.task('single', function() {
			return gulp.src(files, {
					base: base
				})
				.pipe(plumber(function (err) {
		            debug('task single出错: %s', err.message);
		            this.emit('end', err);
		        }))
		        .pipe(gulpFilter(filterList))
		        .pipe(through2.obj(util.replacePath(p, 'production'), function(cb) {
		        	p._singleDone = true;

		        	// p.manifest去重
		        	var unique = function() {
		        		var list = [];

						p.manifest.forEach(function(item) {
							var findIt = _.find(list, function(one) {
								return _.isEqual(item.src, one.src) && _.isEqual(item.repo, one.repo);
							});

							if(findIt) {
								findIt.rel = _.union(findIt.rel, item.rel);
							} else {
								list.push(item);
							}
						});
						return list;
		        	};

					p.manifest = unique();

		        	// debug('完成收集manifest=\n', p.manifest);

		        	cb();
		        }))
				.pipe(gulp.dest(destVm))
				.on('end', done);
		});

		gulp.start('single');
	};

	// 生成group文件
	var groupFile = function(done) {
		var doGroup = function(item, cb) {
			gulp.task('group', function() {
				var groupPath;
				if(item._type === 'css') {
					groupPath = path.join('style', item._group + '.css');
				} else if(item._type === 'js') {
					groupPath = path.join('js', item._group + '.js');
				}

				return gulp.src(item.src, {
						base: base,
						cwd: base
					})
					.pipe(plumber(function (err) {
			            debug('task group出错: %s', err.message);
			            this.emit('end', err);
			        }))
					.pipe(concat(groupPath))
					.pipe(gulpif(item._type === 'js', uglify(), minifyCss()))
					.pipe(rev())
					.pipe(through2.obj(function(file, enc, _cb) {
						file = new File(file);

						if(file.isNull()) {		
					        return _cb(null, file);		
					    }

					    var filePath;
					    if(item._type === 'css') {
					    	file.extname = '.group.css';
					    } else if(item._type === 'js') {
						    file.extname = '.group.js';
					    }
					    
					    var doc = {
					    	src: item.src,
					    	dest: url.resolve(p.project.production.web, file.relative)
					    };
					    p.updateManifest(doc);
					    _cb(null, file);
					}))
					.pipe(gulp.dest(destStatic))
					.on('end', cb);
			});
			
			gulp.start('group');
		};

		var list = _.filter(p.manifest, function(item) {
    		return !!item._group;
    	});

    	async.each(list, doGroup, done);
	};

	// 处理_group和_inline
	var groupAndInline = function(done) {
		gulp.task('groupAndInline', function() {
			return gulp.src(files, {
					base: base
				})
				.pipe(plumber(function (err) {
		            debug('task groupReplace出错: %s', err.message);
		            this.emit('end', err);
		        }))
		        .pipe(gulpFilter(filterList))
		        .pipe(through2.obj(util.replacePath(p, 'production')))
				.pipe(gulp.dest(destVm))
				.on('end', done);
		});

		gulp.start('groupAndInline');
	};

	var tasks = [single, groupFile, groupAndInline];
	async.series(tasks, function(err) {
		console.log('输出模板：%s', destVm);
		// 把files参数传递下去，方便async.waterfall的下个阶段使用
		callback(err, files);
	});
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
				debug('本次提交=', data);
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
		function(cb) {
			// 忽略空仓库时checkout的报错
			git.checkout('master', function() {
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
			console.log('版本%s已发布过，直接签出%s', commit, destCommit);
			return p.checkout(destCommit, function(err) {
				var destRoot = common.getCwd(p.project.repo, 'production');
				var destVm = path.join(destRoot, 'vm');

				console.log('输出静态资源：生产环境已多版本并存，本次不再处理');
				console.log('输出模板：%s', destVm);
				callback();
			});
		} else {
			debug('开始发布...');

			var checkAMD = function() {
				var next = arguments[arguments.length - 1];
				util.hasAMD(p.project, function(err, ret){
					hasAMD = ret;
					debug('hasAMD=%o', ret);
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
					debug('mark', data);
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

Production._debug = {
	getRelative: getRelative
};

module.exports = Production;
