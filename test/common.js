var path = require('path');
var tape = require('tape');
var common = require('../module/common.js');

var repo = 'https://test.com/user/project';

tape('getPathname', test => {
	var pathname = common.getPathname(repo);
	test.equal(pathname, 'user_project');
	test.end();
});

tape('getPathname2', test => {
	var repo = 'https://test.com/user/project.git';
	var pathname = common.getPathname(repo);
	test.equal(pathname, 'user_project');
	test.end();
});

tape('getCwd', test => {
	var local = common.getCwd(repo, 'src');
	var expected = path.join(__dirname, '../data/src/test.com/user_project');
	test.equal(local, expected);
	test.end();
});
