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
var exec = require('child_process').exec;
var config = require('config');
var colors = require('colors');
var util = require('./util.js');
var common = require('./common.js');
var Git = require('./git.js');

function Production(project) {
	this.project = project;
	this.publicPath = util.getProjectPublicPath(project, 'production');
    this.manifest = [];
}

/**
 * 更新manifest属性
 * @param  {Object.<src, [dest], [rel]>} doc
 *                  src和rel的路径都是相对于项目根目录
 * @return {Production}
 */
Production.prototype.updateManifest = function(doc) {
	var p = this;
	var findIt;

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
    var manifest;

	file = new File(file);

	if(file.isNull()) {		
        return cb(null, file);		
    }
    
	if(file.path !== 'rev-manifest.json') {
		return cb(null, file);
	}

	try {
		manifest = JSON.parse(file.contents.toString());
		// debug('updateManifestHelper manifest=%s', file.contents.toString());
	} catch(err) {
		return cb(err, file);
	}

	var docs = []; // 方便做单元测试
	_.mapObject(manifest, function(value, key) {
		var dest = url.resolve(p.publicPath, value);
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

Production.prototype.getBasename = function(filepath) {
	var ret = path.parse(filepath);
	return ret.base.slice(0, ret.base.length - ret.ext.length);
};

// 处理静态资源
Production.prototype.compileStaticFiles = function(callback) {
    debug('处理静态资源');
    var p = this;

    var files = ['**/*'];
    var src = common.getCwd(p.project.repo, 'src');
    var destRoot = common.getCwd(p.project.repo, 'production');
    var destStatic = path.join(destRoot, 'static');
    var build = common.getCwd(p.project.repo, 'build');
    var ignoreList = util.getIgnore(src);
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
                    base: src
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
                    base: src
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
            var hasJsFiles = _.some(files, function(item) {
                return (item === '**/*') || (item.slice(-3) === '.js');
            });
            if(!hasJsFiles) {
                debug('本次无变更的js');
                return done();
            }

            var optimize = function(cb) {
                var optimizerPath = path.join(__dirname, '../node_modules/requirejs/bin/r.js');
                try {
                    fs.accessSync(optimizerPath);
                } catch(err) {
                    optimizerPath = path.join(__dirname, '../../requirejs/bin/r.js');
                }
				var command = ['node', optimizerPath, '-o', 
								util.getAMDBuildPath(p.project), 
								'inlineText=true', 'optimize=uglify', 'optimizeCss=none'
							].join(' ');
		        exec(command, {cwd: src}, cb);
            };

            var copy = function(cb) {
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
                        .on('end', cb);
                });

                gulp.start('copy');
            };

            var updateConfig = function(cb) {
                debug('updateConfig');

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
                    return gulp.src(util.getAMDConfigPath(p.project), {
                            base: src
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
                        .on('end', cb);
                });

                gulp.start('updateConfig');
            };

            var tasks = [optimize, copy, updateConfig];
            async.series(tasks, done);
        };

        var otherAction = function(done) {
            gulp.task('js', function() {
                return gulp.src(files, {
                        base: src
                    })
                    .pipe(plumber(function (err) {
                        debug('task js出错 第%d行: %s', err.lineNumber, err.message);
                        this.emit('end', err);
                    }))
                    .pipe(gulpFilter(['**/*.js'].concat(ignoreList)))
                    .pipe(uglify())
                    .pipe(rev())
                    .pipe(gulp.dest(destStatic))
                    .pipe(rev.manifest())
                    .pipe(through2.obj(p.updateManifestHelper.bind(p)))
                    .on('end', done);
            });

            gulp.start('js');
        };

        util.hasAMD(p.project) ? amdAction(cb) : otherAction(cb);
    };

    async.series([img, css, js], function(err, results) {
        console.log(colors.green('输出静态资源：' + destStatic));
        callback(err);
    });
};

function replaceHelper(doc, file) {
	doc.rel = doc.rel || [];
	var relative = getRelative(file);
	var relExisted = _.contains(doc.rel, relative);
	!relExisted && doc.rel.push(relative);
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

	var hrefValue = (href.match(/^href='?"?(?![\/\$])([^'"]+)'?"?$/i) || '')[1];
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
	var base = src;
	var fullPath;

	if(compress) {
		var findIt = _.find(p.manifest, function(item) {
			return _.isEqual(item.src, [cssPath]);
		});
		if(findIt) {
			var minCssPath = findIt.dest.slice(p.publicPath.length);
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
		content = fs.readFileSync(fullPath, 'utf8');
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
	var base = src;
	var fullPath;

	if(compress) {
		var findIt = _.find(p.manifest, function(item) {
			return _.isEqual(item.src, [jsPath]);
		});
		if(findIt) {
			var minJsPath = findIt.dest.slice(p.publicPath.length);
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
		content = fs.readFileSync(fullPath, 'utf8');
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

	var srcValue = (src.match(/^src='?"?(?![\/\$])([^'"]+)'?"?$/i) || '')[1];
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
        var isAbsolutePath = sub[0] === '/';
        var isVmVar = sub[0] === '$';
		if(protocol || isAbsolutePath || isVmVar) {
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
    var isAbsolutePath = sub[0] === '/';
    var isVmVar = sub[0] === '$';
	if(isDataURI || protocol || isAbsolutePath || isVmVar) {
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
		return match.replace(sub, newSrc);
	}
};

// 处理模板文件
Production.prototype.compileVmFiles = function(callback) {
	debug('处理模板文件');
	var p = this;
	
	var files = ['**/*'];
	var src = common.getCwd(p.project.repo, 'src');
	var destRoot = common.getCwd(p.project.repo, 'production');
	var destStatic = path.join(destRoot, 'static');
	var destVm = path.join(destRoot, 'vm');
	var ignoreList = util.getIgnore(src);
	var filterList = util.getVmFileType().concat(ignoreList);

	// 处理单个静态外链
	var single = function(done) {
		gulp.task('single', function() {
			return gulp.src(files, {
					base: src
				})
				.pipe(plumber(function (err) {
		            debug('task single出错: %s', err.message);
		            this.emit('end', err);
		        }))
		        .pipe(gulpFilter(filterList))
		        .pipe(through2.obj(util.replacePath(p, 'production'), function(cb) {
		        	p._singleDone = true;
					p.manifest = p.duplicate(p.manifest);
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
						base: src,
						cwd: src
					})
					.pipe(plumber(function (err) {
			            debug('task group出错: %s', err.message);
			            this.emit('end', err);
			        }))
					.pipe(concat(groupPath))
					.pipe(gulpif(item._type === 'js', uglify(), minifyCss()))
					.pipe(rev())
					.pipe(through2.obj(function(_file, enc, _cb) {
						file = new File(_file);

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
					    	dest: url.resolve(p.publicPath, file.relative)
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
					base: src
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

	async.series([single, groupFile, groupAndInline], function(err) {
		console.log(colors.green('输出模板：' + destVm));
		callback(err);
	});
};

Production.prototype.duplicate = function(manifest) {
	var list = [];

	manifest.forEach(function(item) {
		var findIt = _.find(list, function(one) {
			return _.isEqual(item.src, one.src);
		});

		if(findIt) {
			findIt.rel = _.union(findIt.rel, item.rel);
		} else {
			list.push(item);
		}
	});
	return list;
};

Production.prototype.run = function(commit, callback) {
	var p = this;
	
	var clean = function(cb) {
		var dist = common.getCwd(p.project.repo, 'production');
		fs.remove(dist, cb);
	};

	var tasks = [
		clean, 
		util.getProject.bind(util, p.project, commit),
		p.compileStaticFiles.bind(p),
		p.compileVmFiles.bind(p)
	];
	async.series(tasks, callback);
};

Production._debug = {
	getRelative: getRelative
};

module.exports = Production;
