import { useTheme } from '../context/ThemeContext'

// Dark theme: light-on-dark badge. Light theme: dark "LS" with the red stitch ring, no black box.
export default function Logo({ className = 'h-11 w-11' }) {
  const { theme } = useTheme()
  return (
    <img
      src={theme === 'light' ? '/logo-light.webp' : '/logo-dark.webp'}
      alt="Loopstitch"
      width="256"
      height="256"
      className={`${className} object-contain`}
    />
  )
}
