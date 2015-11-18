var path = require('path');
var expect = require('expect.js');
var common = require('../module/common.js');

describe(__filename, function(){
	var repo = 'https://test.com/user/project';

	it('getPathname', function(){
		var pathname = common.getPathname(repo);
		expect(pathname).to.be('user_project');
	});

	it('getPathname2', function(){
		var repo = 'https://test.com/user/project.git';
		var pathname = common.getPathname(repo);
		expect(pathname).to.be('user_project');
	});

	it('getCwd', function(){
		var local = common.getCwd(repo, 'src');
		var expected = path.join(__dirname, '../data/src/test.com/user_project');
		expect(local).to.be(expected);
	});
});