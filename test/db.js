var db = require('../module/db.js');
var should = require('should');
var debug = require('debug')('febu:' + __filename);

describe(__filename, function(){
	before(function(done){
		db.init(done);
	});

	it('db.projects.save', function(done){
		var project = {
			repo: 'https://github.com/holyzfy/trygit',
			development: {
				ftp: '',
				web: '//qa.developer.163.com/'
			},
			production: {
				ftp: '',
				web: '//img1.cache.netease.com/f2e/'
			}
		};
		db.projects.save(project, done);		
	});
	
	it('db.projects.find', function(done) {
		var repo = 'https://github.com/holyzfy/trygit';
		db.projects.find(repo, function(err, ret){
			should.not.exist(err);
			should.exist(ret);
			done();
		});
	});

	it('db.projects.remove', function(done) {
		var conditions = {
			repo: 'https://github.com/holyzfy/trygit'
		};
		db.projects.remove(conditions, done);
	});
	
});