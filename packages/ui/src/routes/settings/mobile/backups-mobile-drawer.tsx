import {Loader2} from 'lucide-react'
import {useCallback} from 'react'
import {FaRegSave} from 'react-icons/fa'
import {TbHistory, TbSettings} from 'react-icons/tb'
import {useNavigate} from 'react-router-dom'

import {FadeInImg} from '@/components/ui/fade-in-img'
import backupsIcon from '@/features/backups/assets/backups-icon.png'
import {useBackups} from '@/features/backups/hooks/use-backups'
import {useSettingsDialogProps} from '@/routes/settings/_components/shared'
import {Button} from '@/shadcn-components/ui/button'
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from '@/shadcn-components/ui/drawer'
import {t} from '@/utils/i18n'

export function BackupsMobileDrawer() {
	const dialogProps = useSettingsDialogProps()
	const navigate = useNavigate()
	const {repositories: backupRepositories, isLoadingRepositories: isLoadingBackups} = useBackups()

	const goToSetup = useCallback(() => {
		navigate('/settings/backups/setup', {preventScrollReset: true})
	}, [navigate])

	const goToConfigure = useCallback(() => {
		navigate('/settings/backups/configure', {preventScrollReset: true})
	}, [navigate])

	const goToRestore = useCallback(() => {
		navigate('/settings/backups/restore', {preventScrollReset: true})
	}, [navigate])

	return (
		<Drawer {...dialogProps}>
			<DrawerContent>
				<DrawerHeader className='flex flex-col items-center text-center'>
					<div className='py-5'>
						<FadeInImg src={backupsIcon} width={67} height={67} alt='' />
					</div>
					<DrawerTitle>{t('backups')}</DrawerTitle>
					<DrawerDescription>{t('backups-description')}</DrawerDescription>
				</DrawerHeader>
				<DrawerFooter>
					{/* There are 3 buttons (Set up, Configure, Restore) */}
					{/* We always render the "Restore" button */}
					{/* We render the "Set up" button if the user has no backup repo yet, or the "Configure" button if they do*/}
					{/* If we're still checking for existing backup repos we just show a load spinner in place of the Set up or Configure button */}
					{isLoadingBackups ? (
						<Button size='dialog' disabled aria-busy='true'>
							<Loader2 className='size-4 animate-spin' aria-hidden='true' />
							<span className='sr-only'>{t('loading')}</span>
						</Button>
					) : (backupRepositories?.length ?? 0) === 0 ? (
						<Button onClick={goToSetup} size='dialog' variant='primary'>
							<FaRegSave className='size-4' />
							{t('backups-setup')}
						</Button>
					) : (
						<Button onClick={goToConfigure} size='dialog'>
							<TbSettings className='size-4' />
							{t('Configure')}
						</Button>
					)}
					<Button onClick={goToRestore} size='dialog'>
						<TbHistory className='size-4' />
						{t('backups-restore')}
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	)
}
