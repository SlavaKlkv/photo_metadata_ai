import type { ComponentType, SVGProps } from 'react';
import { ReactComponent as ArrowDown } from '../../../assets/icons/arrow-down.svg';
import { ReactComponent as CheckmarkIcon } from '../../../assets/icons/checkmark-icon.svg';
import { ReactComponent as ClockIcon } from '../../../assets/icons/clock-icon.svg';
import { ReactComponent as DashIcon } from '../../../assets/icons/dash-icon.svg';
import { ReactComponent as DocIcon } from '../../../assets/icons/doc-icon.svg';
import { ReactComponent as DownloadIcon } from '../../../assets/icons/download-icon.svg';
import { ReactComponent as EditIcon } from '../../../assets/icons/edit-icon.svg';
import { ReactComponent as ErrorIcon } from '../../../assets/icons/error-icon.svg';
import { ReactComponent as FolderIcon } from '../../../assets/icons/folder-icon.svg';
import { ReactComponent as ImgIcon } from '../../../assets/icons/img-icon.svg';
import { ReactComponent as ImgModalIcon } from '../../../assets/icons/img-modal-icon.svg';
import { ReactComponent as InfoIcon } from '../../../assets/icons/info-icon.svg';
import { ReactComponent as LoadIcon } from '../../../assets/icons/load-icon.svg';
import { ReactComponent as Logo } from '../../../assets/icons/logo.svg';
import { ReactComponent as MetaIcon } from '../../../assets/icons/meta-icon.svg';
import { ReactComponent as RestartIcon } from '../../../assets/icons/restart-icon.svg';
import { ReactComponent as ResultsIcon } from '../../../assets/icons/results-icon.svg';
import { ReactComponent as SettingsIcon } from '../../../assets/icons/settings-icon.svg';
import { ReactComponent as StartIcon } from '../../../assets/icons/start-icon.svg';
import { ReactComponent as AiSetupIcon } from '../../../assets/icons/ai-setup-icon.svg';
import { ReactComponent as ConnectAccountIcon } from '../../../assets/icons/connect-account-icon.svg';
import { ReactComponent as GeminiIcon } from '../../../assets/icons/gemini-icon.svg';
import { ReactComponent as LinkIcon } from '../../../assets/icons/link-icon.svg';
import { ReactComponent as OpenRouterIcon } from '../../../assets/icons/openrouter-icon.svg';
import { ReactComponent as QwenIcon } from '../../../assets/icons/qwen-icon.svg';
import { ReactComponent as CheckboxIcon } from '../../../assets/icons/checkbox-icon.svg';
import styles from './Icon.module.scss';

export type IconName =
  | 'ai-setup-icon'
  | 'arrow-down'
  | 'checkmark-icon'
  | 'checkbox-icon'
  | 'clock-icon'
  | 'connect-account-icon'
  | 'dash-icon'
  | 'doc-icon'
  | 'download-icon'
  | 'edit-icon'
  | 'error-icon'
  | 'folder-icon'
  | 'gemini-icon'
  | 'img-icon'
  | 'img-modal-icon'
  | 'info-icon'
  | 'link-icon'
  | 'load-icon'
  | 'logo'
  | 'meta-icon'
  | 'openrouter-icon'
  | 'qwen-icon'
  | 'restart-icon'
  | 'results-icon'
  | 'settings-icon'
  | 'start-icon';

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

const icons: Record<IconName, ComponentType<SVGProps<SVGSVGElement>>> = {
  'arrow-down': ArrowDown,
  'checkmark-icon': CheckmarkIcon,
  'checkbox-icon': CheckboxIcon,
  'clock-icon': ClockIcon,
  'dash-icon': DashIcon,
  'doc-icon': DocIcon,
  'download-icon': DownloadIcon,
  'edit-icon': EditIcon,
  'error-icon': ErrorIcon,
  'folder-icon': FolderIcon,
  'img-icon': ImgIcon,
  'img-modal-icon': ImgModalIcon,
  'info-icon': InfoIcon,
  'load-icon': LoadIcon,
  'logo': Logo,
  'meta-icon': MetaIcon,
  'restart-icon': RestartIcon,
  'results-icon': ResultsIcon,
  'settings-icon': SettingsIcon,
  'start-icon': StartIcon,
  'ai-setup-icon': AiSetupIcon,
  'connect-account-icon': ConnectAccountIcon,
  'gemini-icon': GeminiIcon,
  'link-icon': LinkIcon,
  'openrouter-icon': OpenRouterIcon,
  'qwen-icon': QwenIcon,
};

export const Icon = ({ name, className, ...props }: IconProps) => {
  const Svg = icons[name];
  const svgClassName = [styles.icon, className].filter(Boolean).join(' ');

  return <Svg className={svgClassName} {...props} />;
};

