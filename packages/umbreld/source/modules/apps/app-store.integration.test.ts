import {expect, beforeAll, afterAll, test} from 'vitest'

import createTestUmbreld from '../test-utilities/create-test-umbreld.js'
import runGitServer from '../test-utilities/run-git-server.js'

let umbreld: Awaited<ReturnType<typeof createTestUmbreld>>
let communityAppStoreGitServer: Awaited<ReturnType<typeof runGitServer>>

beforeAll(async () => {
	;[umbreld, communityAppStoreGitServer] = await Promise.all([createTestUmbreld(), runGitServer()])
})

afterAll(async () => {
	await Promise.all([communityAppStoreGitServer.close(), umbreld.cleanup()])
})

// The following tests are stateful and must be run in order

test.sequential('registry() throws invalid error when no user is registered', async () => {
	await expect(umbreld.client.appStore.registry.query()).rejects.toThrow('Invalid token')
})

test.sequential('addRepository() throws invalid error when no user is registered', async () => {
	await expect(umbreld.client.appStore.addRepository.mutate({url: communityAppStoreGitServer.url})).rejects.toThrow(
		'Invalid token',
	)
})

test.sequential('removeRepository() throws invalid error when no user is registered', async () => {
	await expect(umbreld.client.appStore.removeRepository.mutate({url: communityAppStoreGitServer.url})).rejects.toThrow(
		'Invalid token',
	)
})

test.sequential('login', async () => {
	await expect(umbreld.registerAndLogin()).resolves.toBe(true)
})

test.sequential('registry() returns app registry', async () => {
	await expect(umbreld.client.appStore.registry.query()).resolves.toStrictEqual([
		{
			url: umbreld.instance.appStore.defaultAppStoreRepo,
			meta: {
				id: 'sparkles',
				name: 'Sparkles',
			},
			apps: [
				{
					appStoreId: 'sparkles',
					manifestVersion: '1.0.0',
					id: 'sparkles-hello-world',
					name: 'Hello World',
					tagline: "Replace this tagline with your app's tagline",
					icon: 'https://svgur.com/i/mvA.svg',
					category: 'Development',
					version: '1.0.0',
					port: 4000,
					description: "Add your app's description here.\n\nYou can also add newlines!",
					developer: 'Umbrel',
					website: 'https://umbrel.com',
					submitter: 'Umbrel',
					submission: 'https://github.com/getumbrel/umbrel-hello-world-app',
					repo: 'https://github.com/getumbrel/umbrel-hello-world-app',
					support: 'https://github.com/getumbrel/umbrel-hello-world-app/issues',
					gallery: [
						'https://i.imgur.com/yyVG0Jb.jpeg',
						'https://i.imgur.com/yyVG0Jb.jpeg',
						'https://i.imgur.com/yyVG0Jb.jpeg',
					],
					releaseNotes: "Add what's new in the latest version of your app here.",
					dependencies: [],
					path: '',
					defaultUsername: '',
					defaultPassword: '',
					backupIgnore: ['data', 'logs', 'cache'],
				},
			],
		},
	])
})

test.sequential('addRepository() adds a second repository', async () => {
	await expect(umbreld.client.appStore.addRepository.mutate({url: communityAppStoreGitServer.url})).resolves.toBe(true)
})

test.sequential('registry() returns both app repositories in registry', async () => {
	await expect(umbreld.client.appStore.registry.query()).resolves.toStrictEqual([
		{
			url: umbreld.instance.appStore.defaultAppStoreRepo,
			meta: {
				id: 'sparkles',
				name: 'Sparkles',
			},
			apps: [
				{
					appStoreId: 'sparkles',
					manifestVersion: '1.0.0',
					id: 'sparkles-hello-world',
					name: 'Hello World',
					tagline: "Replace this tagline with your app's tagline",
					icon: 'https://svgur.com/i/mvA.svg',
					category: 'Development',
					version: '1.0.0',
					port: 4000,
					description: "Add your app's description here.\n\nYou can also add newlines!",
					developer: 'Umbrel',
					website: 'https://umbrel.com',
					submitter: 'Umbrel',
					submission: 'https://github.com/getumbrel/umbrel-hello-world-app',
					repo: 'https://github.com/getumbrel/umbrel-hello-world-app',
					support: 'https://github.com/getumbrel/umbrel-hello-world-app/issues',
					gallery: [
						'https://i.imgur.com/yyVG0Jb.jpeg',
						'https://i.imgur.com/yyVG0Jb.jpeg',
						'https://i.imgur.com/yyVG0Jb.jpeg',
					],
					releaseNotes: "Add what's new in the latest version of your app here.",
					dependencies: [],
					path: '',
					defaultUsername: '',
					defaultPassword: '',
					backupIgnore: ['data', 'logs', 'cache'],
				},
			],
		},
		{
			url: communityAppStoreGitServer.url,
			meta: {
				id: 'sparkles',
				name: 'Sparkles',
			},
			apps: [
				{
					appStoreId: 'sparkles',
					manifestVersion: '1.0.0',
					id: 'sparkles-hello-world',
					name: 'Hello World',
					tagline: "Replace this tagline with your app's tagline",
					icon: 'https://svgur.com/i/mvA.svg',
					category: 'Development',
					version: '1.0.0',
					port: 4000,
					description: "Add your app's description here.\n\nYou can also add newlines!",
					developer: 'Umbrel',
					website: 'https://umbrel.com',
					submitter: 'Umbrel',
					submission: 'https://github.com/getumbrel/umbrel-hello-world-app',
					repo: 'https://github.com/getumbrel/umbrel-hello-world-app',
					support: 'https://github.com/getumbrel/umbrel-hello-world-app/issues',
					gallery: [
						'https://i.imgur.com/yyVG0Jb.jpeg',
						'https://i.imgur.com/yyVG0Jb.jpeg',
						'https://i.imgur.com/yyVG0Jb.jpeg',
					],
					releaseNotes: "Add what's new in the latest version of your app here.",
					dependencies: [],
					path: '',
					defaultUsername: '',
					defaultPassword: '',
					backupIgnore: ['data', 'logs', 'cache'],
				},
			],
		},
	])
})

test.sequential('addRepository() throws adding a repository that has already been added', async () => {
	await expect(umbreld.client.appStore.addRepository.mutate({url: communityAppStoreGitServer.url})).rejects.toThrow(
		'already exists',
	)
})

test.sequential('removeRepository() removes a reposoitory', async () => {
	await expect(umbreld.client.appStore.removeRepository.mutate({url: communityAppStoreGitServer.url})).resolves.toBe(
		true,
	)
})

test.sequential('registry() no longer returns an app repository that has been removed', async () => {
	await expect(umbreld.client.appStore.registry.query()).resolves.toStrictEqual([
		{
			url: umbreld.instance.appStore.defaultAppStoreRepo,
			meta: {
				id: 'sparkles',
				name: 'Sparkles',
			},
			apps: [
				{
					appStoreId: 'sparkles',
					manifestVersion: '1.0.0',
					id: 'sparkles-hello-world',
					name: 'Hello World',
					tagline: "Replace this tagline with your app's tagline",
					icon: 'https://svgur.com/i/mvA.svg',
					category: 'Development',
					version: '1.0.0',
					port: 4000,
					description: "Add your app's description here.\n\nYou can also add newlines!",
					developer: 'Umbrel',
					website: 'https://umbrel.com',
					submitter: 'Umbrel',
					submission: 'https://github.com/getumbrel/umbrel-hello-world-app',
					repo: 'https://github.com/getumbrel/umbrel-hello-world-app',
					support: 'https://github.com/getumbrel/umbrel-hello-world-app/issues',
					gallery: [
						'https://i.imgur.com/yyVG0Jb.jpeg',
						'https://i.imgur.com/yyVG0Jb.jpeg',
						'https://i.imgur.com/yyVG0Jb.jpeg',
					],
					releaseNotes: "Add what's new in the latest version of your app here.",
					dependencies: [],
					path: '',
					defaultUsername: '',
					defaultPassword: '',
					backupIgnore: ['data', 'logs', 'cache'],
				},
			],
		},
	])
})

test.sequential('removeRepository() throws removing a reposoitory that does not exist', async () => {
	await expect(umbreld.client.appStore.removeRepository.mutate({url: communityAppStoreGitServer.url})).rejects.toThrow(
		'does not exist',
	)
})

test.sequential('removeRepository() throws removing the default reposoitory', async () => {
	await expect(
		umbreld.client.appStore.removeRepository.mutate({url: umbreld.instance.appStore.defaultAppStoreRepo}),
	).rejects.toThrow('Cannot remove default repository')
})
