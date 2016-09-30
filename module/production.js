var path = require('path');
var fs = require('fs-extra');
var async = require('async');
var debug = require('debug')('febu:production.js');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var minifyCss = require('gulp-clean-css');
var rev = require('gulp-rev');
var _ = require('underscore');
var url = require('url');
var through2 = require('through2');
var gulp = require('gulp');
var gulpif = require('gulp-if');
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
    this.destVm = path.join(this.destRoot, 'vm');
    this.build = common.getCwd(project.repo, 'build');
    this.ignoreList = util.getIgnore(this.src);
}

/**
 * 更新manifest属性
 * @param  {Object.<src, [dest], [rel]>} doc
 *                  src和rel的路径都是相对于项目根目录
 * @return {Production}
 */
Production.prototype.updateManifest = function(doc) {
	var findIt;

	doc.src = [].concat(doc.src);

	if(doc._group) {
		findIt = _.find(this.manifest, item => {
			return (item._group === doc._group) && (item._type === doc._type) && _.isEqual(item.rel, doc.rel);
		});
	} else {
		findIt = _.find(this.manifest, item => _.isEqual(item.src, doc.src));
	}
	
	if(findIt) {
		if(doc.rel) {
			doc.rel = [].concat(doc.rel);
			doc.rel = _.union(findIt.rel, doc.rel);
		}
		doc.src = _.union(findIt.src, doc.src);
		_.extend(findIt, doc);
	} else {
		this.manifest.push(doc);
	}

	return this;
};

Production.prototype.updateManifestHelper = function (file, enc, cb) {
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
		var dest = decodeURI(url.resolve(this.publicPath, value));
		var doc = {
			src: key,
			dest: dest
		};
		docs.push(doc);
		this.updateManifest(doc);
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
        util.jsnext.bind(null, this.project),
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
    var staticList = util.getStaticFileType().concat(this.ignoreList);
    var files = _.filter(staticList, item => (item !== '**/*.css') && (item !== '**/*.js'));
    gulp.src(files, {
        cwd: this.src
    })
    .pipe(plumber(function (err) {
        debug('task img出错: %s', err.message);
        this.emit('end', err);
    }))
    .pipe(rev())
    .pipe(gulp.dest(this.destStatic))
    .pipe(rev.manifest())
    .pipe(through2.obj(this.updateManifestHelper.bind(this), cb => {
        cb();
        done();
    }));
};

/**
 * 1. 替换静态资源内链（图片，字体...）-> build目录
 * 2. build目录 -> min + rev -> dest目录
 * 3. 更新manifest
 */
Production.prototype.css = function (callback) {
    debug('css');

    var output2build = done => {
        var files = ['**/*.css'].concat(this.ignoreList);
        gulp.src(files, {
            cwd: this.src
        })
        .pipe(plumber(function (err) {
            debug('task build出错: %s', err.message);
            this.emit('end', err);
        }))
        .pipe(through2.obj(util.replacePath(this, 'production'))) // 替换静态资源链接
        .pipe(gulp.dest(this.build))
        .pipe(util.taskDone(done));
    };

    var style = done => {
        gulp.src('**/*.css', {
            cwd: this.build
        })
        .pipe(plumber(function (err) {
            debug('task css出错: %s', err.message);
            this.emit('end', err);
        }))
        .pipe(minifyCss())
        .pipe(rev())
        .pipe(gulp.dest(this.destStatic))
        .pipe(rev.manifest())
        .pipe(through2.obj(this.updateManifestHelper.bind(this), cb => {
            cb();
            done();
        }));
    };

    async.series([output2build, style], callback);
};

// 使用AMD规范的项目
Production.prototype.amd = function (done) {
    debug('amd');
    var tasks = [
        amd.optimize.bind(this),
        amd.copy.bind(this),
        amd.updateConfig.bind(this)
    ];
    async.series(tasks, done);
};

var amd = {};

amd.optimize = function (done) {
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
    shell.exec(command, { cwd: this.src }, done);
};

amd.copy = function (done) {
    var files = ['**/*.js'].concat(this.ignoreList);
    gulp.src(files, {
        cwd: path.join(this.src, config.amd.build)
    })
    .pipe(plumber(function (err) {
        debug('task copy出错 第%d行: %s', err.lineNumber, err.message);
        this.emit('end', err);
    }))
    .pipe(rev())
    .pipe(gulp.dest(this.destStatic))
    .pipe(rev.manifest())
    .pipe(through2.obj(this.updateManifestHelper.bind(this), cb => {
        cb();
        done();
    }));
};

amd.updateConfig = function (done) {
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
        base: this.src,
        cwd: this.src
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
    .pipe(through2.obj(this.updateManifestHelper.bind(this), cb => {
        cb();
        done();
    }));
};

// 未使用AMD规范的项目
Production.prototype.js = function (done) {
    debug('js');
    var files = ['**/*.js'].concat(this.ignoreList);
    gulp.src(files, {
        cwd: this.src
    })
    .pipe(plumber(function (err) {
        debug('task js出错 第%d行: %s', err.lineNumber, err.message);
        this.emit('end', err);
    }))
    .pipe(uglify())
    .pipe(rev())
    .pipe(gulp.dest(this.destStatic))
    .pipe(rev.manifest())
    .pipe(through2.obj(this.updateManifestHelper.bind(this), cb => {
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
	var href = attrs.filter(item => /^href=/i.test(item))[0];

	if(!href) {
		return match;
	}

    var hrefValue = (href.match(/^href='?"?(?![/$<{])([^'"]+)'?"?$/i) || '')[1];
    if(!hrefValue) {
        return match;
    }
    hrefValue = url.parse(hrefValue).pathname;

	var inline = attrs.filter(item => /^_inline=?$/i.test(item))[0];

	if(inline) {
		if(this._singleDone) {
			var compress = attrs.filter(item => /^_compress=?$/i.test(item))[0];
			return this.styleInline(hrefValue, compress);
		}

		return match;
	}

	var group = attrs.filter( item => /^_group=/i.test(item))[0];

	if(group) {
		var groupValue = this.getGroup(group);

		if(!this._singleDone) {
			// 收集_group信息
			var doc = {
				src: hrefValue,
				_group: groupValue,
				_type: 'css'
			};
			replaceHelper(doc, file);
			this.updateManifest(doc);
			return match;
		}
		
        // 替换_group
		var relative = getRelative(file);
		var findIt = _.find(this.manifest, item => {
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

	var replacement = (match, sub) => {
		var protocol = url.parse(sub).protocol;
		if(protocol) {
			return match;
		}

		var subPath = util.relPath(file, sub);
        subPath = url.parse(subPath).pathname;
		var doc = _.find(this.manifest, item => {
			return item.src[0] == subPath;
		});
		if(!doc) {
			return match;
		}
		
		replaceHelper(doc, file);
		return 'href="' + doc.dest + '"';
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
	var src = common.getCwd(this.project.repo, 'src');
	var fullPath;

	if(compress) {
		var findIt = _.find(this.manifest, item => _.isEqual(item.src, [cssPath]));
		if(findIt) {
			var minCssPath = findIt.dest.slice(this.publicPath.length);
			var destRoot = common.getCwd(this.project.repo, 'production');
			fullPath = path.join(destRoot, 'static', minCssPath);
		} else {
			console.error('出错：未找到%s对应的压缩文件', cssPath);
		}
	} else {
		fullPath = path.join(src, cssPath);
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
	var src = common.getCwd(this.project.repo, 'src');
	var fullPath;

	if(compress) {
		var findIt = _.find(this.manifest, item => _.isEqual(item.src, [jsPath]));
		if(findIt) {
			var minJsPath = findIt.dest.slice(this.publicPath.length);
			var destRoot = common.getCwd(this.project.repo, 'production');
			fullPath = path.join(destRoot, 'static', minJsPath);
		} else {
			console.error('出错：未找到%s对应的压缩文件', jsPath);
		}
	} else {
		fullPath = path.join(src, jsPath);
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
	var src = attrs.filter(item => /^src=/i.test(item))[0];

	if(!src) {
		return match;
	}

    var srcValue = (src.match(/^src='?"?(?![/$<{])([^'"]+)'?"?$/i) || '')[1];
    if(!srcValue) {
        return match;
    }
    srcValue = url.parse(srcValue).pathname;

	var inline = attrs.filter(item => /^_inline=?$/i.test(item))[0];

	var isScript = /^<script\s/i.test(match);

	if(isScript && inline) {
		if(this._singleDone) {
			var compress = attrs.filter(item => /^_compress=?$/i.test(item))[0];
			return this.scriptInline(srcValue, compress);
		}

		return match;
	}

	var group = attrs.filter(item => /^_group=/i.test(item))[0];

	if(isScript && group) {
		var groupValue = this.getGroup(group);

		if(!this._singleDone) {
			// 收集_group信息
			var doc = {
				src: srcValue,
				_group: groupValue,
				_type: 'js'
			};
			replaceHelper(doc, file);
			this.updateManifest(doc);
			return match;
		}

		// 替换_group
		var relative = getRelative(file);
		var findIt = _.find(this.manifest, item => {
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
		return '<script src="' + findIt.dest + '"></script>';
	}

	var replacement = (match, sub) => {
		var protocol = url.parse(sub).protocol;
		if(protocol) {
			return match;
		}

		var subPath = util.relPath(file, sub);
        subPath = url.parse(subPath).pathname;
		var doc = _.find(this.manifest, item => item.src[0] == subPath);
		if(!doc) {
			return match;
		}

		replaceHelper(doc, file);
		return 'src="' + doc.dest + '"';
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
	var data = attrs.filter(item => /^data=/i.test(item))[0];

	var replacement = (match, sub) => {
        var protocol = url.parse(sub).protocol;
        var isAbsolutePath = sub[0] === '/';
        var isVmVar = /[$<{]/.test(sub[0]);
		if(protocol || isAbsolutePath || isVmVar) {
			return match;
		}

		var subPath = util.relPath(file, sub);
        subPath = url.parse(subPath).pathname;
		var doc = _.find(this.manifest, item => item.src[0] == subPath);
		if(!doc) {
			return match;
		}

		replaceHelper(doc, file);
		return 'data="' + doc.dest + '"';
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

Production.prototype.replaceSrcset = function(match, srcList, file) {
    srcList.forEach(src => {
        var isDataURI = src.slice(0, 5) === 'data:';
        var protocol = url.parse(src).protocol;
        var isAbsolutePath = src[0] === '/';
        var isVmVar = /[$<{]/.test(src[0]);
        if(isDataURI || protocol || isAbsolutePath || isVmVar) {
            return;
        }

        var srcPath = util.relPath(file, src);
        var doc = _.find(this.manifest, item => item.src[0] == srcPath);
        if(!doc) {
            return match;
        }

        replaceHelper(doc, file);
        match = match.replace(src, doc.dest);     
    });
    return match;
};

Production.prototype.replaceUrl = function(match, sub, file) {
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
	var doc = _.find(this.manifest, item => item.src[0] == subPath);
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
    var tasks = [
        vm.single.bind(this),
        vm.group.bind(this),
        vm.groupAndInline.bind(this)
    ];
	async.series(tasks, err => {
		console.log(colors.green('输出模板：' + this.destVm));
		callback(err);
	});
};

var vm = {};

// 处理单个静态外链
vm.single = function (done) {
    debug('single');
    var vmList = util.getVmFileType().concat(this.ignoreList);
    gulp.src(vmList, {
        cwd: this.src
    })
    .pipe(plumber(function (err) {
        debug('task single出错: %s', err.message);
        this.emit('end', err);
    }))
    .pipe(through2.obj(util.replacePath(this, 'production'), cb => {
        this._singleDone = true;
        this.manifest = this.duplicate(this.manifest);
        
        // debug('完成收集manifest=\n', this.manifest);
        cb();
    }))
    .pipe(gulp.dest(this.destVm))
    .pipe(util.taskDone(done));
};

// 生成group文件
vm.group = function (done) {
    debug('group');
    var doGroup = (item, cb) => {
        var groupPath;
        var pathRoot = this.src;
        if(item._type === 'css') {
            groupPath = path.join('style', item._group + '.css');
            pathRoot = this.build;
        } else if(item._type === 'js') {
            groupPath = path.join('js', item._group + '.js');
        }

        gulp.src(item.src, {
            base: pathRoot,
            cwd: pathRoot
        })
        .pipe(plumber(function (err) {
            debug('task group出错: %s', err.message);
            this.emit('end', err);
        }))
        .pipe(concat(groupPath))
        .pipe(gulpif(item._type === 'js', uglify(), minifyCss()))
        .pipe(rev())
        .pipe(through2.obj((_file, enc, _cb) => {
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
                dest: decodeURI(url.resolve(this.publicPath, file.relative))
            };
            this.updateManifest(doc);
            _cb(null, file);
        }))
        .pipe(gulp.dest(this.destStatic))
        .pipe(util.taskDone(cb));         
    };

    var list = _.filter(this.manifest, item => !!item._group);
    async.each(list, doGroup, done);
};

// 处理_group和_inline
vm.groupAndInline = function (done) {
    debug('groupAndInline');
    var vmList = util.getVmFileType().concat(this.ignoreList);
    gulp.src(vmList, {
        cwd: this.src
    })
    .pipe(plumber(function (err) {
        debug('task groupReplace出错: %s', err.message);
        this.emit('end', err);
    }))
    .pipe(through2.obj(util.replacePath(this, 'production')))
    .pipe(gulp.dest(this.destVm))
    .pipe(util.taskDone(done));
};

Production.prototype.duplicate = function(manifest) {
	var list = [];

	manifest.forEach(item => {
		var findIt = _.find(list, one => _.isEqual(item.src, one.src));
		if(findIt) {
			findIt.rel = _.union(findIt.rel, item.rel);
		} else {
			list.push(item);
		}
	});
	return list;
};

Production.prototype.run = function(commit, callback) {
	var tasks = [
        util.clean(this.build),
		util.clean(this.destRoot),
		util.getProject.bind(util, this.project, commit),
		this.compileStaticFiles.bind(this),
		this.compileVmFiles.bind(this)
	];
	async.series(tasks, callback);
};

Production._debug = {
	getRelative: getRelative
};

module.exports = Production;
