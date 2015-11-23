var fs = require('fs-extra');
var path = require('path');
var File = require('vinyl');
var expect = require('expect.js');
var sinon = require('sinon');
var util = require('../module/util.js');

describe(__filename, function(){
	var project = {
		repo: 'https://github.com/requirejs/example-multipage'
	};

	it('resolvePath', function(){
		var from = 'd:/febu/data/src/github.com/test/index.html';
		var to = 'style/list.css';
		var base = 'd:/febu/data/src/github.com/test';

		var ret = util.resolvePath(from, to, base);
		var ret2 = path.normalize(ret);
		var to2 = path.normalize(to);
		expect(ret2).to.be(to2);
	});

	it('hasAMD', function() {
		var project = {
			repo: 'https://test.com/user/project'
		};
		expect(util.hasAMD(project)).to.not.be.ok();
	});

	it('getAMDBuildPath', function() {
		var project = {
			repo: 'https://test.com/user/project'
		};
		expect(util.getAMDBuildPath).withArgs(project).to.throwException();
	});

	it('getAMDConfigPath', function() {
        var buildPath = path.join(__dirname, './testcase/project1/build.js');
        util.getAMDBuildPath = sinon.stub().returns(buildPath);
        var project = {};
        var actual = util.getAMDConfigPath(project);
        expect(actual).to.be(path.join(__dirname, './testcase/project1/js/config.js'));
    });

    it('getAMDOutputPath', function() {
        var project = {};
        var actual = util.getAMDOutputPath(project);
        expect(actual).to.be('/absoulte/path/to/output');
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

	it('getIgnore: empty', function() {
		var testRet = util.getIgnore('./');
		expect(testRet).to.eql([]);
	});

	it('getIgnore: has febu.json', function() {
		var data = {
		    "ignore": [
		        "mock",
		        "selenium/",
		        "templates",
		        "test.js"
		    ]
		};
		var expected = [
	        "!mock/**/*",
	        "!mock",
	        "!selenium/**/*",
	        "!selenium",
	        "!templates/**/*",
	        "!templates",
	        "!test.js/**/*",
	        "!test.js"
	    ];
		var configFile = 'febu.json';
		fs.writeJsonSync(configFile, data);
		var ret = util.getIgnore('./');
		fs.removeSync(configFile);
		expect(ret).to.eql(expected);
	});

});