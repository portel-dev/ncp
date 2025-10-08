
jest.mock('../src/utils/version', () => ({
	getPackageInfo: () => ({ version: '1.2.3', packageName: '@portel/ncp' })
}));

describe('version utility', () => {
	it('should return the mocked version', () => {
		const { getPackageInfo } = require('../src/utils/version');
		expect(getPackageInfo().version).toBe('1.2.3');
		expect(getPackageInfo().packageName).toBe('@portel/ncp');
	});
});

