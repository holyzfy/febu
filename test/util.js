var fs = require('fs-extra');
var path = require('path');
var File = require('vinyl');
var tape = require('tape');
var sinon = require('sinon');
var proxyquire = require('proxyquire');
var util = proxyquire('../module/util.js', {
    'parse-gitignore': sinon.stub().returns(['node_modules', 'node_modules/**'])
});

var project = {
	repo: 'https://github.com/requirejs/example-multipage'
};

tape('resolvePath', test => {
	var from = 'd:/febu/data/src/github.com/test/index.html';
	var to = 'style/list.css';
	var base = 'd:/febu/data/src/github.com/test';

	var ret = path.normalize(util.resolvePath(from, to, base));
	var expected = path.normalize(to);
    test.equal(ret, expected);
    test.end();
});

tape('hasAMD', test => {
	var project = {
		repo: 'https://test.com/user/project'
	};
    test.notOk(util.hasAMD(project));
    test.end();
});

tape('getAMDBuildPath', test => {
	var project = {
		repo: 'https://test.com/user/project'
	};
    test.throws(util.getAMDBuildPath.bind(util, project));
    test.end();
});

tape('getAMDConfigPath', test => {
	var _getAMDBuildPath = util.getAMDBuildPath;
    var buildPath = path.join(__dirname, './testcase/project1/build.js');
    util.getAMDBuildPath = sinon.stub().returns(buildPath);
    var project = {};
    var actual = util.getAMDConfigPath(project);
    util.getAMDBuildPath = _getAMDBuildPath;
    var expected = path.join(__dirname, './testcase/project1/js/config.js');
    test.equal(actual, expected);
    test.end();
});

tape('getAMDOutputPath', test => {
	var _getAMDBuildPath = util.getAMDBuildPath;
    var buildPath = path.join(__dirname, './testcase/project1/build.js');
    util.getAMDBuildPath = sinon.stub().returns(buildPath);
    var project = {};
    var actual = util.getAMDOutputPath(project);
    util.getAMDBuildPath = _getAMDBuildPath;
    var expected = path.resolve('/absoulte/path/to/output');
    test.equal(actual, expected);
    test.end();
});

tape('fixAMDPathKey', test => {
	var jqueryDest = 'http://static.f2e.example.com/assets/test_project/lib/jquery';
	var paths = {
		jquery: 'lib/jquery',
		'lib/jquery': jqueryDest
	};
	var newPaths = util.fixAMDPathKey(paths);
    test.equal(newPaths.jquery, jqueryDest);
    test.end();
});

tape('replaceConfigPaths: require.config(...)', test => {
	var contents = "  require.config({baseUrl: 'js', paths: {'jquery': 'lib/jquery', 'bower': '../bower_components'}, shim: {'highcharts': ['jquery'] } }); ";
	var newPaths = {
		jquery: '//code.jquery.com/jquery-1.11.3.min'
	};
	var newContents = util.replaceConfigPaths(contents, newPaths);
    test.ok(newContents.indexOf('require.config(') > -1);
    test.equal(newContents.indexOf('lib/jquery'), -1);
    test.ok(newContents.indexOf('//code.jquery.com/jquery-1.11.3.min') > -1);
    test.ok(newContents.indexOf('bower') > -1);
    test.end();
});

tape('replaceConfigPaths: var require = ...', test => {
	var contents = "var require = {waitSeconds: 0, paths: {'jquery': 'lib/jquery'}}";
	var newPaths = {
		jquery: '//code.jquery.com/jquery-1.11.3.min'
	};
	var newContents = util.replaceConfigPaths(contents, newPaths);
    test.equal(newContents.indexOf('lib/jquery'), -1);
    test.ok(newContents.indexOf('//code.jquery.com/jquery-1.11.3.min') > -1);
    test.end();
});

tape('relPath', test => {
	var css = new File({
		base: '/febu/data_temp/test_project',
		path: '/febu/data_temp/test_project/style/sub_xxx/login.css'
	});
	var imagePath = '../../images/sub_xxx/btn.png';
	var cssRet = util.relPath(css, imagePath);
	var cssExpected = 'images/sub_xxx/btn.png';
    test.equal(cssRet, cssExpected);

	var html = new File({
		base: '/febu/data_temp/test_project',
		path: '/febu/data_temp/test_project/www/inc/head_static.html'
	});
	var jsPath = 'js/config.js';
	var htmlRet = util.relPath(html, jsPath);
	var htmlExpected = 'js/config.js';
    test.equal(htmlRet, htmlExpected);

	var html2 = new File({
		base: '/febu/data_temp/test_project',
		path: '/febu/data_temp/test_project/www/module/nav.html'
	});
	var jsPath2 = '../js/nav.js';
	var htmlRet2 = util.relPath(html2, jsPath2);
	var htmlExpected2 = 'www/js/nav.js';
    test.equal(htmlRet2, htmlExpected2);

    test.end();
});

tape('getIgnore', test => {
	var data = {
	    "ignore": [
	        "mock",
	        "selenium/",
	        "templates",
	        "test.js"
	    ]
	};
	var expected = [
        "!node_modules",
        "!node_modules/**",
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
    test.deepEqual(ret, expected);
    test.end();
});
