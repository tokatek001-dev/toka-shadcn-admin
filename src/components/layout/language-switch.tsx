import { Check, Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/hooks/use-language'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type LanguageSwitchProps = {
  variant?: 'icon' | 'text'
  className?: string
}

const LANGUAGE_LABELS = {
  en: 'EN',
  vi: 'VN',
} as const

export function LanguageSwitch({
  variant = 'icon',
  className,
}: LanguageSwitchProps) {
  const { t } = useTranslation()
  const { language, setLanguage, languages } = useLanguage()

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {variant === 'text' ? (
          <Button
            variant='ghost'
            size='sm'
            className={cn('scale-95 rounded-full', className)}
          >
            {LANGUAGE_LABELS[language]}
            <span className='sr-only'>{t('language.label')}</span>
          </Button>
        ) : (
          <Button
            variant='ghost'
            size='icon'
            className={cn('scale-95 rounded-full', className)}
          >
            <Languages className='size-[1.2rem]' />
            <span className='sr-only'>{t('language.label')}</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        {languages.map((lang) => (
          <DropdownMenuItem key={lang} onClick={() => setLanguage(lang)}>
            {t(`language.${lang}`)}
            <Check
              size={14}
              className={cn('ms-auto', language !== lang && 'hidden')}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
