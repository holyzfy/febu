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
var shell = require('shelljs');
var util = require('./util.js');
var common = require('./common.js');

function Production(project) {
    this.project = project;
    this.publicPath = util.getProjectPublicPath(project, 'production');
    this.manifest = [];
    this.src = common.getCwd(project.repo, 'src');
    this.destRoot = common.getCwd(project.repo, 'production');
    this.destStatic = path.join(this.destRoot, 'static');
    this.build = common.getCwd(project.repo, 'build');
    this.ignoreList = util.getIgnore(this.src);
    this.filterList = util.getStaticFileType().concat(this.ignoreList);
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
		findIt = _.find(p.manifest, item => {
			return (item._group === doc._group) && (item._type === doc._type) && _.isEqual(item.rel, doc.rel);
		});
	} else {
		findIt = _.find(p.manifest, item => {
			return _.isEqual(item.src, doc.src);
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
	} catch(err) {
		return cb(err, file);
	}

	var docs = []; // 方便做单元测试
	_.mapObject(manifest, (value, key) => {
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

Production.prototype.compileStaticFiles = function(callback) {
    var tasks = [
        this.img.bind(this),
        this.css.bind(this),
        util.hasAMD(this.project) ? this.amd.bind(this) : this.js.bind(this)
    ];
    async.series(tasks, err => {
        console.log(colors.green('输出静态资源：' + this.destStatic));
        callback(err);
    });
};

/**
 * 1. 除js, css的静态资源rev后输出到dest目录
 * 2. 更新manifest
 */
Production.prototype.img = function (done) {
    debug('img');
    var imgFilterList = _.filter(this.filterList, item => {
        return (item !== '**/*.css') && (item !== '**/*.js');
    });

    gulp.src(['**/*'], {
        base: this.src
    })
    .pipe(plumber(err => {
        debug('task img出错: %s', err.message);
        this.emit('end', err);
    }))
    .pipe(gulpFilter(imgFilterList))
    .pipe(rev())
    .pipe(gulp.dest(this.destStatic))
    .pipe(rev.manifest())
    .pipe(through2.obj(this.updateManifestHelper.bind(this), cb => {
        cb();
        done();
    }));
};

Production.prototype.clean = function (done) {
    del(this.build, {
        force: true
    }).then(() => done());
};

/**
 * 1. 替换静态资源内链（图片，字体...）-> build目录
 * 2. build目录 -> min + rev -> dest目录
 * 3. 更新manifest
 */
Production.prototype.css = function (callback) {
    debug('css');
    var cssFilterList = ['**/*.css'].concat(this.ignoreList);

    var output2build = done => {
        gulp.src(['**/*'], {
            base: this.src
        })
        .on('end', done)
        .pipe(plumber(err => {
            debug('task build出错: %s', err.message);
            this.emit('end', err);
        }))
        .pipe(gulpFilter(cssFilterList))
        .pipe(through2.obj(util.replacePath(this, 'production'))) // 替换静态资源链接
        .pipe(gulp.dest(this.build));
    };

    var style = done => {
        gulp.src('**/*.css', {
            base: this.build,
            cwd: this.build
        })
        .pipe(plumber(err => {
            debug('task css出错: %s', err.message);
            this.emit('end', err);
        }))
        .pipe(gulpFilter(cssFilterList))
        .pipe(minifyCss())
        .pipe(rev())
        .pipe(gulp.dest(this.destStatic))
        .pipe(rev.manifest())
        .pipe(through2.obj(this.updateManifestHelper.bind(this), cb => {
            cb();
            done();
        }));
    };

    async.series([this.clean.bind(this), output2build, style], callback);
};

/**
 * 使用AMD规范的项目
 * 1. build目录：optimize=uglify, optimizeCss=none
 * 2.1 build目录(所有.js) -> rev -> dest目录
 * 2.2 更新manifest
 * 3.1 config.js替换paths值 -> build目录 -> min + rev -> dest目录
 * 3.2 更新manifest
 */
Production.prototype.amd = function (done) {
    debug('js');

    var optimize = cb => {
        var optimizerPath = path.join(__dirname, '../node_modules/requirejs/bin/r.js');
        try {
            fs.accessSync(optimizerPath);
        } catch(err) {
            optimizerPath = path.join(__dirname, '../../requirejs/bin/r.js');
        }
        var command = ['node', optimizerPath, '-o', 
                util.getAMDBuildPath(this.project), 
                'inlineText=true', 'optimize=uglify', 'optimizeCss=none'
            ].join(' ');
        shell.exec(command, { cwd: this.src }, cb);
    };

    var copy = cb => {
        gulp.src('**/*.js', {
            cwd: path.join(this.src, config.amd.build)
        })
        .pipe(plumber(function (err) {
            debug('task copy出错 第%d行: %s', err.lineNumber, err.message);
            this.emit('end', err);
        }))
        .pipe(gulpFilter(this.filterList))
        .pipe(rev())
        .pipe(gulp.dest(this.destStatic))
        .pipe(rev.manifest())
        .pipe(through2.obj(this.updateManifestHelper.bind(this), _cb => {
            _cb();
            cb();
        }));
    };

    var updateConfig = cb => {
        var jsMap = _.filter(this.manifest, item => {
            var isJsFile = item.src[0].slice(-3) === '.js';
            return isJsFile;
        });
        var newPaths = {};
        var configPathDir = path.dirname(util.getAMDConfigPath(this.project));
        _.each(jsMap, item => {
            var file = new File({
                path: path.join(this.src, item.src[0])
            });
            var relativePath = path.relative(configPathDir, file.path);
            var key = relativePath.endsWith('.js') ? relativePath.slice(0, -3) : relativePath;
            var dest = item.dest.slice(0, -3);
            newPaths[key] = dest;
        });

        gulp.src(util.getAMDConfigPath(this.project), {
            base: this.src
        })
        .pipe(plumber(function (err) {
            debug('task updateConfig出错 第%d行: %s', err.lineNumber, err.message);
            this.emit('end', err);
        }))
        .pipe(through2.obj((file, enc, cb) => {
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
        .pipe(gulp.dest(this.destStatic))
        .pipe(rev.manifest())
        .pipe(through2.obj(this.updateManifestHelper.bind(this), _cb => {
            _cb();
            cb();
        }));
    };

    var tasks = [optimize, copy, updateConfig];
    async.series(tasks, done);
};

/** 
 * 未使用AMD规范的项目
 * 1. files -> rev -> dest目录
 * 2. 更新manifest
 */
Production.prototype.js = function (done) {
    gulp.src(['**/*.js'], {
        base: this.src
    })
    .pipe(plumber(err => {
        debug('task js出错 第%d行: %s', err.lineNumber, err.message);
        this.emit('end', err);
    }))
    .pipe(this.ignoreList)
    .pipe(uglify())
    .pipe(rev())
    .pipe(gulp.dest(this.destStatic))
    .pipe(rev.manifest())
    .pipe(through2.obj(this.updateManifestHelper.bind(this), function(cb) {
        cb();
        done();
    }));
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

    var hrefValue = (href.match(/^href='?"?(?![/$<{])([^'"]+)'?"?$/i) || '')[1];
    if(!hrefValue) {
        return match;
    }
    hrefValue = url.parse(hrefValue).pathname;

	var inline = attrs.filter(function(item) {
		return /^_inline=?$/i.test(item);
	})[0];

	if(inline) {
		if(p._singleDone) {
			var compress = attrs.filter(function(item){
				return /^_compress=?$/i.test(item);
			})[0];
			return p.styleInline(hrefValue, compress);
		}

		return match;
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
		}
		
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
		}

		findIt._groupDone[relative] = true; // 标记为已替换
		var link = '<link rel="stylesheet" href="' + findIt.dest + '" />';
		return link;
	}

	function replacement(match, sub) {
		var protocol = url.parse(sub).protocol;
		if(protocol) {
			return match;
		}

		var subPath = util.relPath(file, sub);
        subPath = url.parse(subPath).pathname;
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

    var srcValue = (src.match(/^src='?"?(?![/$<{])([^'"]+)'?"?$/i) || '')[1];
    if(!srcValue) {
        return match;
    }
    srcValue = url.parse(srcValue).pathname;

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
		}

		return match;
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
		}

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
		}

		findIt._groupDone[relative] = true; // 标记为已替换
		var script = '<script src="' + findIt.dest + '"></script>';
		return script;
	}

	function replacement(match, sub) {
		var protocol = url.parse(sub).protocol;
		if(protocol) {
			return match;
		}

		var subPath = util.relPath(file, sub);
        subPath = url.parse(subPath).pathname;
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

	function replacement(match, sub) {
        var protocol = url.parse(sub).protocol;
        var isAbsolutePath = sub[0] === '/';
        var isVmVar = /[$<{]/.test(sub[0]);
		if(protocol || isAbsolutePath || isVmVar) {
			return match;
		}

		var subPath = util.relPath(file, sub);
        subPath = url.parse(subPath).pathname;
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

	if(/^data="/i.test(data)) {
		match = match.replace(/\bdata="([^"]+)"/i, replacement);
	} else if(/^data='/i.test(data)) {
		match = match.replace(/\bdata='([^']+)'/i, replacement);
	} else if(/^data=(?!["'])/i.test(data)) {
		match = match.replace(/\bdata=([^\s\\>]+)/i, replacement);
	}
	return match;
};

Production.prototype.replaceSrcset = function(match, srcList, file) {
    var p = this;

    srcList.forEach(function(src) {
        var isDataURI = src.slice(0, 5) === 'data:';
        var protocol = url.parse(src).protocol;
        var isAbsolutePath = src[0] === '/';
        var isVmVar = /[$<{]/.test(src[0]);
        if(isDataURI || protocol || isAbsolutePath || isVmVar) {
            return;
        }

        var srcPath = util.relPath(file, src);
        var doc = _.find(p.manifest, function(item) {
            return item.src[0] == srcPath;
        });
        if(!doc) {
            return match;
        }

        replaceHelper(doc, file);
        match = match.replace(src, doc.dest);     
    });
    return match;
};

Production.prototype.replaceUrl = function(match, sub, file) {
	var p = this;
	sub = sub.trim();
	var isDataURI = sub.slice(0, 5) === 'data:';
	var protocol = url.parse(sub).protocol;
    var isAbsolutePath = sub[0] === '/';
    var isVmVar = /[$<{]/.test(sub[0]);
	if(isDataURI || protocol || isAbsolutePath || isVmVar) {
		return match;
	}

    sub = url.parse(sub.trim()).pathname;
	var subPath = util.relPath(file, sub);
	var doc = _.find(p.manifest, function(item) {
		return item.src[0] == subPath;
	});
	if(!doc) {
		return match;
	}

	replaceHelper(doc, file);

    // debug('replaceUrl: %s => %s', sub, doc.dest);
	return match.replace(sub, doc.dest);
};

// 处理模板文件
Production.prototype.compileVmFiles = function(callback) {
	debug('处理模板文件');
	var p = this;
	
	var files = ['**/*'];
	var src = common.getCwd(p.project.repo, 'src');
    var build = common.getCwd(p.project.repo, 'build');
	var destRoot = common.getCwd(p.project.repo, 'production');
	var destStatic = path.join(destRoot, 'static');
	var destVm = path.join(destRoot, 'vm');
	var ignoreList = util.getIgnore(src);
	var filterList = util.getVmFileType().concat(ignoreList);

	// 处理单个静态外链
	function single(done) {
        gulp.src(files, {
			base: src
		})
		.on('end', done)
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
        .pipe(gulp.dest(destVm));
	}

	// 生成group文件
	function groupFile(done) {
		function doGroup(item, cb) {
			var groupPath;
            var pathRoot = src;
			if(item._type === 'css') {
				groupPath = path.join('style', item._group + '.css');
                pathRoot = build;
			} else if(item._type === 'js') {
				groupPath = path.join('js', item._group + '.js');
			}

		    gulp.src(item.src, {
				base: pathRoot,
				cwd: pathRoot
			})
            .on('end', cb)
			.pipe(plumber(function (err) {
	            debug('task group出错: %s', err.message);
	            this.emit('end', err);
	        }))
			.pipe(concat(groupPath))
			.pipe(gulpif(item._type === 'js', uglify(), minifyCss()))
			.pipe(rev())
			.pipe(through2.obj(function(_file, enc, _cb) {
				var file = new File(_file);

				if(file.isNull()) {		
			        return _cb(null, file);		
			    }

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
			.pipe(gulp.dest(destStatic));            
		}

		var list = _.filter(p.manifest, function(item) {
    		return !!item._group;
    	});

    	async.each(list, doGroup, done);
	}

	// 处理_group和_inline
	function groupAndInline(done) {
        gulp.src(files, {
			base: src
		})
        .on('end', done)
		.pipe(plumber(function (err) {
            debug('task groupReplace出错: %s', err.message);
            this.emit('end', err);
        }))
        .pipe(gulpFilter(filterList))
        .pipe(through2.obj(util.replacePath(p, 'production')))
		.pipe(gulp.dest(destVm));
	}

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
	
	function clean(done) {
		var dist = common.getCwd(p.project.repo, 'production');
        del(dist, {
            force: true
        }).then(function() {
            done();
        });
	}

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
