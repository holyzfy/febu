var debug = require('debug')('febu:development.js');
var path = require('path');
var url = require('url');
var fs = require('fs-extra');
var async = require('async');
var gulp = require('gulp');
var gulpFilter = require('gulp-filter');
var through2 = require('through2');
var _ = require('underscore');
var plumber = require('gulp-plumber');
var exec = require('child_process').exec;
var File = require('vinyl');
var config = require('config');
var colors = require('colors');
var Git = require('./git.js');
var util = require('./util.js');
var common = require('./common.js');

function Dev(project) {
	this.project = project;
}

// 收集静态资源
Dev.prototype.resource = function(files, callback) {
	debug('resource');
	var dev = this;
	gulp.task('resource', function(){
		var src = common.getCwd(dev.project.repo, 'src');
		var destRoot = common.getCwd(dev.project.repo, 'development');
		var destStatic = path.join(destRoot, 'static');
		var ignoreList = util.getIgnore(src);
		var filterList = util.getStaticFileType().concat(ignoreList);
		console.log(colors.green('输出静态资源：' + destStatic));
		gulp.src(files, {
			base: src
		})
		.pipe(plumber(function (err) {
            debug('出错 第%d行: %s', err.lineNumber, err.message);
            this.emit('end');
        }))
		.pipe(gulpFilter(filterList))
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
			var publicPath = util.getProjectPublicPath(dev.project, 'development');
			var newHref = url.resolve(publicPath, subPath);
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

Dev.prototype.resolvePath = function(file, src) {
	var dev = this;
	var publicPath = util.getProjectPublicPath(dev.project, 'development');
	return url.resolve(publicPath, util.relPath(file, src));
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
			return 'src="' + dev.resolvePath(file, sub) + '"';
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
			return 'data="' + dev.resolvePath(file, sub) + '"';
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
		return ':url(' + dev.resolvePath(file, sub) + ')';
	}
};

Dev.prototype.js = function(files, callback) {
	debug('js', arguments);
	var dev = this;
	var src = common.getCwd(dev.project.repo, 'src');
	var base = src;
	var destRoot = common.getCwd(dev.project.repo, 'development');
	var destStatic = path.join(destRoot, 'static');
	var ignoreList = util.getIgnore(base);
	var filterList = util.getStaticFileType().concat(ignoreList);

	var amdAction = function(done) {
		debug('amdAction', arguments);
		// 本次发布有变更的js文件吗
		var hasJsFiles = _.some(files, function(item) {
			return (item === '**/*') || (item.slice(-3) === '.js');
		});
		if(!hasJsFiles) {
			debug('本次无变更的js');
			return done();
		}

		var newPaths = {};

		var optimize = function(cb) {
			debug('js:optimize', arguments);
			var optimizerPath = path.join(__dirname, '../node_modules/requirejs/bin/r.js');
			var command = ['node', optimizerPath, '-o', 
							util.getAMDBuildPath(dev.project), 
							'inlineText=true', 'optimize=none', 'optimizeCss=none'
						].join(' ');
	        exec(command, {cwd: src}, cb);
	    };

	    var copy = function() {
	    	debug('js:copy');
	    	var next = arguments[arguments.length - 1];

    		gulp.task('copy', function() {
	    		var output = util.getAMDOutputPath(dev.project);
			    var publicPath = util.getProjectPublicPath(dev.project, 'development');
	    		return gulp.src('**/*.js', {
		    			cwd: output
		    		})
	    			.pipe(plumber(function (err) {
			            debug('出错 第%d行: %s', err.lineNumber, err.message);
			            this.emit('end');
			        }))
			        .pipe(gulpFilter(filterList))
			        .pipe(through2.obj(function (file, enc, cb) {
						file = new File(file);

						if(file.isNull()) {		
				            return cb(null, file);		
				        }

						var filePath = path.relative(output, file.path);
						var newFilePath = url.resolve(publicPath, filePath);
						var key = file.basename.slice(0, -3); // 去掉扩展名
			    		var dest = newFilePath.slice(0, -3);
			    		newPaths[key] = dest;
						cb(null, file);
					}))
					.pipe(gulp.dest(destStatic))
					.on('end', next);
    		});
    		
    		gulp.start('copy');
	    };

	    var updateConfig = function() {
	    	debug('js:updateConfig');
	    	var next = arguments[arguments.length - 1];

	    	return gulp.src(util.getAMDConfigPath(dev.project), {
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

	    async.series([optimize, copy, updateConfig], done);
	};	

	var otherAction = function(done) {
		debug('otherAction');
		done();
	};
	util.hasAMD(dev.project) ? amdAction(callback) : otherAction(callback);
};

// 处理html文件
Dev.prototype.html = function(files, callback) {
	debug('html');
	var dev = this;
	
	gulp.task('html', function(){
		var src = common.getCwd(dev.project.repo, 'src');
		var destRoot = common.getCwd(dev.project.repo, 'development');
		var dest = path.join(destRoot, 'vm');
		var ignoreList = util.getIgnore(src);
		var filterList = util.getVmFileType().concat(ignoreList);
		console.log(colors.green('输出html：' + dest));
		gulp.src(files, {
			base: src
		})
		.pipe(gulpFilter(filterList))
		.pipe(through2.obj(util.replacePath(dev, 'development'))) // 替换静态资源链接
		.pipe(gulp.dest(dest))
		.on('end', callback)
		.on('error', callback);
	});
	gulp.start('html');
}

Dev.prototype.run = function(commit, callback) {
	var dev = this;

	var clean = function(cb) {
		var dist = common.getCwd(dev.project.repo, 'development');
		fs.remove(dist, cb);
	};

	var checkout = function(cb) {
		debug('checkout:%s', commit);
		util.getProject(dev.project, commit, cb);
	};

	var compile = function(cb) {
		var files = ['**/*'];
		var tasks = [
			dev.resource.bind(dev, files),
			dev.js.bind(dev, files),
			dev.html.bind(dev, files)
		];
		async.series(tasks, cb);
	};

	async.series([clean, checkout, compile], callback);
};

module.exports = Dev;