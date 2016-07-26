var path = require('path');
var expect = require('expect.js');
var common = require('../module/common.js');

describe(__filename, () => {
	var repo = 'https://test.com/user/project';

	it('getPathname', () => {
		var pathname = common.getPathname(repo);
		expect(pathname).to.be('user_project');
	});

	it('getPathname2', () => {
		var repo = 'https://test.com/user/project.git';
		var pathname = common.getPathname(repo);
		expect(pathname).to.be('user_project');
	});

	it('getCwd', () => {
		var local = common.getCwd(repo, 'src');
		var expected = path.join(__dirname, '../data/src/test.com/user_project');
		expect(local).to.be(expected);
	});
});