import nodePath from 'node:path'
import pWaitFor from 'p-wait-for'

import fse from 'fs-extra'
import {$} from 'execa'
import PQueue from 'p-queue'

import {isRaspberryPi} from '../system/system.js'

import type Umbreld from '../../index.js'

type BlockDevice = {
	id: string
	name: string
	// Type more values here as we use them like emmc or sdcard
	transport: 'unknown' | 'usb' | 'nvme'
	size: number
	partitions: {
		id: string
		type: string
		size: number
		mountpoints: string[]
		label: string
	}[]
}

// Get block devices
// TODO: This should probably be in a system module once we have a proper one
export async function getBlockDevices() {
	type LsBlkDevice = {
		name: string
		label?: string
		type?: string
		mountpoints?: string[]
		tran?: BlockDevice['transport']
		model?: string
		size?: number
		children?: LsBlkDevice[]
		parttypename?: string
	}
	const {stdout} = await $`lsblk --output-all --json --bytes`
	const {blockdevices} = JSON.parse(stdout) as {blockdevices: LsBlkDevice[]}

	// Loop over block devices
	const externalStorageDevices: BlockDevice[] = []
	for (const blockDevice of blockdevices) {
		// Skip non-disk block devices
		if (blockDevice.type !== 'disk') continue

		// Create a new external storage device
		const device: BlockDevice = {
			id: blockDevice.name,
			name: blockDevice.model ?? 'Untitled',
			transport: blockDevice.tran ?? 'unknown',
			size: blockDevice.size ?? 0,
			partitions: [],
		}

		// Create partitions
		for (const partition of blockDevice.children ?? []) {
			// Skip any non-partition block devices
			if (partition.type !== 'part') continue

			// Add the partition to the device
			device.partitions.push({
				id: partition.name,
				type: partition.parttypename ?? 'unknown',
				label: partition.label?.trim() ?? 'Untitled',
				size: partition.size ?? 0,
				mountpoints: partition.mountpoints?.filter(Boolean) ?? [],
			})
		}

		// Add the device to the list
		externalStorageDevices.push(device)
	}

	return externalStorageDevices
}

export default class ExternalStorage {
	#umbreld: Umbreld
	logger: Umbreld['logger']
	#mountQueue = new PQueue({concurrency: 1})
	#removeDeviceChangeListener?: () => void

	constructor(umbreld: Umbreld) {
		this.#umbreld = umbreld
		const {name} = this.constructor
		this.logger = umbreld.logger.createChildLogger(`files:${name.toLocaleLowerCase()}`)
	}

	// Only enable this module on non raspberry pi devices.
	// We disable on Pi due to unreliable power issues when running USB storage devices
	// and also due to complexities with the current mount script.
	async supported() {
		const isNotRaspberryPi = !(await isRaspberryPi())
		return isNotRaspberryPi
	}

	// Add listener
	async start() {
		// Don't run through start process if we're not enabled
		const isEnabled = await this.supported()
		if (!isEnabled) return

		this.logger.log('Starting external storage')

		// Safely clean up any left over mount points
		await this.#cleanLeftOverMountPoints()

		// Auto mount any external devices
		await this.#mountExternalDevices().catch((error) => {
			this.logger.error(`Failed to mount external devices on startup`, error)
		})

		// Attach disk change listener and auto mount any new external devices
		this.#removeDeviceChangeListener = this.#umbreld.eventBus.on('system:disk:change', async () => {
			this.logger.log('Device change detected')
			await this.#mountExternalDevices()
		})
	}

	// Remove listener
	async stop() {
		// Don't run through stop process if we're not enabled
		const isEnabled = await this.supported()
		if (!isEnabled) return

		this.logger.log('Stopping external storage')
		this.#removeDeviceChangeListener?.()

		// Unmount all external devices
		await this.#unmountAllMountedExternalDevices()
	}

	// Mount external disks
	async #mountExternalDevices() {
		// Run through single threaded queue so we don't try to mount concurrently
		return this.#mountQueue.add(async () => {
			// Get external devices
			// Sometimes it takes a while until partition labels and types show up so we wait if we have an
			// unknown partition type. We check type not partition label since partition label sometimes doesn't
			// exist at all due to nothing being set.
			// We stop waiting after 2 seconds just incase everything has loaded but we have some weird partition
			// type that is always unknown.
			// If we don't do this we'll end up mounting all partitions as "Untitled".
			let externalStorageDevices: BlockDevice[] = []
			await pWaitFor(
				async () => {
					externalStorageDevices = await this.#getExternalDevices()
					const hasMissingData = externalStorageDevices.some((device) =>
						device.partitions.some((partition) => partition.type === 'unknown'),
					)
					return !hasMissingData
				},
				{interval: 100, timeout: {milliseconds: 2000, fallback: () => {}}},
			)

			// Loop over external devices
			for (const device of externalStorageDevices) {
				// Loop over partitions
				for (const partition of device.partitions) {
					// Skip partitions that are already mounted
					if (partition.mountpoints.length > 0) continue

					// Skip EFI partitions since they're just confusing for users
					if (partition.type === 'EFI System') continue

					// We have a new partition to mount
					this.logger.log(`Mounting new partition ${device.name} ${partition.label}`)
					try {
						// Derive mountpoint
						const externalBaseSystemPath = this.#umbreld.files.getBaseDirectory('/External')
						const sanitisedLabel = partition.label.replace(/[^a-zA-Z0-9 '\_\-]/g, '')
						let systemMountpoint = nodePath.join(externalBaseSystemPath, sanitisedLabel)
						systemMountpoint = await this.#umbreld.files.getUniqueName(systemMountpoint)

						// Mount partition
						await fse.ensureDir(systemMountpoint)
						await this.#umbreld.files.chownSystemPath(systemMountpoint)
						await $`mount /dev/${partition.id} ${systemMountpoint}`

						// Broadcast event signalling that the external storage devices have changed
						this.#umbreld.eventBus.emit('files:external-storage:change')

						// Log on success
						const virtualMountPoint = this.#umbreld.files.systemToVirtualPath(systemMountpoint)
						this.logger.log(`Mounted partition ${device.name} ${partition.label} as ${virtualMountPoint}`)
					} catch (error) {
						// Just log the error and continue to the next partition
						this.logger.error(`Failed to mount partition ${device.name} ${partition.label}`, error)
					}
				}
			}
		})
	}

	// Unmount partition from external disk
	async unmountExternalDevice(deviceId: string, {remove = true} = {}) {
		// We run this through the mount queue so we don't clean up mount
		// points that are in the process of being mounted.
		// This can happen if the user unmounts a device while attaching another.
		return await this.#mountQueue.add(async () => {
			// Get mount points for block device
			const externalBlockDevices = await this.#getExternalDevices()
			const blockDevice = externalBlockDevices.find((device) => device.id === deviceId)
			if (!blockDevice) throw new Error('[invalid-device-id]')
			this.logger.log(`Unmounting device ${deviceId}`)

			// Loop over partitions
			let failedUnmounts = false
			for (const partition of blockDevice.partitions) {
				// Skip partitions that aren't mounted
				if (partition.mountpoints.length == 0) continue

				// Unmount device
				this.logger.log(`Unmounting partition ${partition.id}`)
				await $`umount --all-targets /dev/${partition.id}`.catch((error) => {
					// Just log the error and continue to next partition
					this.logger.error(`Failed to unmount partition ${partition.id}`, error)
					failedUnmounts = true
				})
			}

			// Clean up any left over mount points
			await this.#cleanLeftOverMountPoints()

			// Remove the block device so we don't auto mount it until it's
			// been removed and re-attached
			if (remove) await fse.writeFile(`/sys/block/${deviceId}/device/delete`, '1')

			// Broadcast event signalling that the external storage devices have changed
			this.#umbreld.eventBus.emit('files:external-storage:change')

			// Signal that some unmounts failed
			if (failedUnmounts) throw new Error('[failed-unmounts]')

			return true
		})
	}

	// Get external devices
	async #getExternalDevices() {
		// Get all block devices
		const blockDevices = await getBlockDevices()

		// Filter out any non-USB devices
		return blockDevices.filter((device) => device.transport === 'usb')
	}

	// Get all umbreld mounted external devices
	// This will only return block devices that have partitions mounted at /External
	// This will only return the mounted partitions for those block devices
	// This will only return the virtual path of the /External mount point
	async getMountedExternalDevices() {
		// Get all block devices
		const externalBlockDevices = await this.#getExternalDevices()

		// Loop over devices
		const externalBaseSystemPath = this.#umbreld.files.getBaseDirectory('/External')
		for (const device of externalBlockDevices) {
			// Loop over partitions
			for (const partition of device.partitions) {
				// Format partitions to only contain /External mount points
				partition.mountpoints = partition.mountpoints
					.filter((mountpoint) => mountpoint.startsWith(externalBaseSystemPath))
					.map((mountpoint) => this.#umbreld.files.systemToVirtualPath(mountpoint))
			}

			// Filter out partitions without mount points from device
			device.partitions = device.partitions.filter((partition) => partition.mountpoints.length > 0)
		}

		// Filter out block devices without partitions
		const mountedExternalDevices = externalBlockDevices.filter((device) => device.partitions.length > 0)

		return mountedExternalDevices
	}

	// Unmount all mounted external devices
	async #unmountAllMountedExternalDevices() {
		// Loop over all mounted external devices
		for (const device of await this.getMountedExternalDevices()) {
			// Unmount the device
			// We don't want to remove the device since this isn't a hard eject.
			// We want the device to be detected if we start again.
			await this.unmountExternalDevice(device.id, {remove: false}).catch((error) => {
				// Just log the error and continue to next device
				this.logger.error(`Failed to unmount external device ${device.id}`, error)
			})
		}
	}

	// Clean left over mount points
	async #cleanLeftOverMountPoints() {
		// Loop over all mount points in /External
		const externalBaseSystemPath = this.#umbreld.files.getBaseDirectory('/External')
		const mountPoints = await fse.readdir(externalBaseSystemPath)
		for (const mountPoint of mountPoints) {
			try {
				// Check if any are not currently used and safe to remove
				const mountPointSystemPath = nodePath.join(externalBaseSystemPath, mountPoint)
				const isMountPointEmpty = (await fse.readdir(mountPointSystemPath)).length === 0
				const isMountPointUnmounted = (await $({reject: false})`mountpoint ${mountPointSystemPath}`).exitCode !== 0
				const isSafeToRemove = isMountPointEmpty && isMountPointUnmounted

				// Remove the mount point if it's safe to do so
				if (isSafeToRemove) {
					this.logger.log(`Cleaning up left over mount point ${mountPoint}`)
					await fse.remove(mountPointSystemPath)
				}
			} catch (error) {
				// Just log the error and continue to next mount point
				this.logger.error(`Failed to clean up left over mount point ${mountPoint}`, error)
			}
		}
	}

	// Check if an external drive is connected on unsupported hardware
	// This is used to notify unsupported users why they can't see their hardware.
	async isExternalDeviceConnectedOnUnsupportedDevice() {
		const isSupported = await this.supported()
		let externalBlockDevices = await this.#getExternalDevices()

		// Exclude any external disks that include the current data directory.
		// This prevents USB storage based Raspberry Pi's detecting their main
		// USB storage drive as a connected external drive.
		const df = await $`df ${this.#umbreld.dataDirectory} --output=source`
		const dataDirDisk = df.stdout.split('\n').pop()?.split('/').pop()?.replace(/\d+$/, '')
		externalBlockDevices = externalBlockDevices.filter((blockDevice) => blockDevice.id !== dataDirDisk)

		return !isSupported && externalBlockDevices.length > 0
	}
}
