var fs = require('fs-extra');
var path = require('path');
var File = require('vinyl');
var expect = require('expect.js');
var sinon = require('sinon');
var util = require('../module/util.js');

describe(__filename, () => {
	var project = {
		repo: 'https://github.com/requirejs/example-multipage'
	};

	it('resolvePath', () => {
		var from = 'd:/febu/data/src/github.com/test/index.html';
		var to = 'style/list.css';
		var base = 'd:/febu/data/src/github.com/test';

		var ret = util.resolvePath(from, to, base);
		var ret2 = path.normalize(ret);
		var to2 = path.normalize(to);
		expect(ret2).to.be(to2);
	});

	it('hasAMD', () => {
		var project = {
			repo: 'https://test.com/user/project'
		};
		expect(util.hasAMD(project)).to.not.be.ok();
	});

	it('getAMDBuildPath', () => {
		var project = {
			repo: 'https://test.com/user/project'
		};
		expect(util.getAMDBuildPath).withArgs(project).to.throwException();
	});

	it('getAMDConfigPath', () => {
		var _getAMDBuildPath = util.getAMDBuildPath;
        var buildPath = path.join(__dirname, './testcase/project1/build.js');
        util.getAMDBuildPath = sinon.stub().returns(buildPath);
        var project = {};
        var actual = util.getAMDConfigPath(project);
        util.getAMDBuildPath = _getAMDBuildPath;
        expect(actual).to.be(path.join(__dirname, './testcase/project1/js/config.js'));
    });

    it('getAMDOutputPath', () => {
    	var _getAMDBuildPath = util.getAMDBuildPath;
        var buildPath = path.join(__dirname, './testcase/project1/build.js');
        util.getAMDBuildPath = sinon.stub().returns(buildPath);
        var project = {};
        var actual = util.getAMDOutputPath(project);
        util.getAMDBuildPath = _getAMDBuildPath;
        expect(actual).to.be(path.resolve('/absoulte/path/to/output'));
    });

    it('fixAMDPathKey', () => {
    	var jqueryDest = 'http://static.f2e.example.com/assets/test_project/lib/jquery';
    	var paths = {
    		jquery: 'lib/jquery',
    		'lib/jquery': jqueryDest
    	};
    	var newPaths = util.fixAMDPathKey(paths);
    	expect(newPaths.jquery).to.be(jqueryDest);
    });

	it('replaceConfigPaths: require.config(...)', () => {
		var contents = "  require.config({baseUrl: 'js', paths: {'jquery': 'lib/jquery', 'bower': '../bower_components'}, shim: {'highcharts': ['jquery'] } }); ";
		var newPaths = {
			jquery: '//code.jquery.com/jquery-1.11.3.min'
		};
		var newContents = util.replaceConfigPaths(contents, newPaths);
		expect(newContents).to.contain("require.config(");
		expect(newContents).to.not.contain('lib/jquery');
		expect(newContents).to.contain('//code.jquery.com/jquery-1.11.3.min');
		expect(newContents).to.contain('bower');
	});

	it('replaceConfigPaths: var require = ...', () => {
		var contents = "var require = {waitSeconds: 0, paths: {'jquery': 'lib/jquery'}}";
		var newPaths = {
			jquery: '//code.jquery.com/jquery-1.11.3.min'
		};
		var newContents = util.replaceConfigPaths(contents, newPaths);
		expect(newContents).to.not.contain('lib/jquery');
		expect(newContents).to.contain('//code.jquery.com/jquery-1.11.3.min');
	});
	
	it('relPath', () => {
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

	it('getIgnore: empty', () => {
		var testRet = util.getIgnore('./');
		expect(testRet).to.eql([]);
	});

	it('getIgnore: has febu.json', () => {
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