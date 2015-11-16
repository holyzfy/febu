var fs = require('fs-extra');
var path = require('path');
var async = require('async');
var File = require('vinyl');
var fs = require('fs-extra');
var expect = require('expect.js');
var util = require('../module/util.js');
var common = require('../module/common.js');
var Git = require('../module/git.js');

describe(__filename, function(){
	var project = {
		repo: 'https://github.com/requirejs/example-multipage'
	};
	var git = new Git(project.repo);

	before(function(done) {	
		fs.remove(git.options.cwd, done);
	});

	it('isEmpty: 文件存在', function(done) {
		var src = path.join(__dirname, '_a_test_path');
		fs.mkdirsSync(src);
		fs.writeFileSync(path.join(src, 'note.txt'), 'hello');
		util.isEmpty(src, function(ret){
			expect(ret).not.to.be.ok();
			fs.remove(src, done);
		});
	});

	it('isEmpty: 文件不存在', function(done) {
		var fold = path.resolve(__dirname, '_not_exsited');
		util.isEmpty(fold, function(ret){
			expect(ret).to.be.ok();
			done();
		});
	});

	it('getProject', function(done) {
		var commit = 'HEAD';
		util.getProject(project, commit, done);
	});

	it('formatCommit', function(done) {
		async.series([
			function(callback){
				var commit = '3bc6453272bdf9e0acfc8099a0f9cd3c07d3a8e4';
				var commitExpected = '3bc6453';
				util.formatCommit(project.repo, commit, function(err, data) {
					if(err) {
						return callback(err);
					}
					expect(data).to.be(commitExpected);
					callback();
				});
			},
			function(callback) {
				util.formatCommit(project.repo, 'HEAD', function(err, commit) {
					expect(commit).to.have.length(7);
					callback(err);
				});
			}
		], done);
	});

	it('resolvePath', function(){
		var from = 'd:/febu/data/src/github.com/test/index.html';
		var to = 'style/list.css';
		var base = 'd:/febu/data/src/github.com/test';

		var ret = util.resolvePath(from, to, base);
		var ret2 = path.normalize(ret);
		var to2 = path.normalize(to);
		expect(ret2).to.be(to2);
	});

	it('getConfigPath', function(done) {
		git.clone(function() {
			var src = common.getCwd(project.repo, 'src');
			var configPath = path.join(src, 'www/js/common.js');

			util.getConfigPath(project, function(err, path) {
				if(err) {
					return done(err);
				}
				expect(path).to.be(configPath);
				done();
			});
		});
	});

	it('replaceConfigPaths', function() {
		var contents = "  require({baseUrl: 'js', paths: {'jquery': 'lib/jquery'}, shim: {'highcharts': ['jquery'] } }); ";
		var newPaths = {
			jquery: '//code.jquery.com/jquery-1.11.3.min'
		};
		var newContents = util.replaceConfigPaths(contents, newPaths);
		expect(newContents.slice(0, "require.config(".length)).to.equal("require.config(");
		expect(newContents.indexOf('lib/jquery')).to.be.below(0);
		expect(newContents.indexOf('//code.jquery.com/jquery-1.11.3.min')).to.be.above(-1);
		expect(newContents.slice(-2)).to.equal(");");
	});
	
	it('hasAMD', function(done) {
		util.hasAMD(project, function(err, exist){
			expect(exist).to.not.be.ok();
			done(err);
		});
	});

	it('relPath', function() {
		var css = new File({
			base: '/febu/data_temp/test_project',
			path: '/febu/data_temp/test_project/style/sub_xxx/login.css'
		});
		var imagePath = '../../images/sub_xxx/btn.png';
		var cssRet = util.relPath(css, imagePath);
		var cssExpected = 'images/sub_xxx/btn.png';
		expect(cssRet).to.equal(cssExpected);

		var html = new File({
			base: '/febu/data_temp/test_project',
			path: '/febu/data_temp/test_project/www/inc/head_static.html'
		});
		var jsPath = 'js/config.js';
		var htmlRet = util.relPath(html, jsPath);
		var htmlExpected = 'js/config.js';
		expect(htmlRet).to.equal(htmlExpected);

		var html2 = new File({
			base: '/febu/data_temp/test_project',
			path: '/febu/data_temp/test_project/www/module/nav.html'
		});
		var jsPath2 = '../js/nav.js';
		var htmlRet2 = util.relPath(html2, jsPath2);
		var htmlExpected2 = 'www/js/nav.js';
		expect(htmlRet2).to.equal(htmlExpected2);
	});

	it('getIgnore', function() {
		var testRet = util.getIgnore('./');
		expect(testRet).to.eql([]);

		var data = {
		    "ignore": [
		        "mock/",
		        "selenium/",
		        "templates/**/*",
		        "test/",
		        "licence"
		    ]
		};
		var expected = [
	        "!mock/**/*",
	        "!selenium/**/*",
	        "!templates/**/*",
	        "!test/**/*",
	        '!licence'
	    ];
		var configFile = 'febu.json';
		fs.writeJsonSync(configFile, data);
		var ret = util.getIgnore('./');
		fs.removeSync(configFile);
		expect(ret).to.eql(expected);
	});

});