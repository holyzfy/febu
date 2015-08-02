# 在mongo命令行里初始化一个项目
	
示例

	mongo

	use febu

	var project = {
		repo: 'https://github.com/holyzfy/trygit',
		development: {
			web: '//qa.developer.test.com/f2e/trygit/'
		},
		production: {
			web: '//qa.developer.test.com/f2e/trygit/'
		}
	}

	db.projects.insert(project)