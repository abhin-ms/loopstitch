import { Link } from 'react-router-dom'
import Logo from './Logo'
import SocialLinks from './SocialLinks'

export default function Footer() {
  return (
    <footer className="border-t border-panel-2 bg-panel mt-12 sm:mt-24">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-10 sm:py-14 grid grid-cols-1 sm:grid-cols-3 gap-8 sm:gap-10">
        <div>
          <div className="mb-3">
            <Logo />
          </div>
          <p className="text-sm text-slate leading-relaxed max-w-xs">
            Unisex oversized tees — limited anime drops and custom prints.
          </p>
          <SocialLinks className="mt-4" />
        </div>
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-slate mb-4">Shop</div>
          <ul className="space-y-2 text-sm text-paper/80">
            <li><Link to="/shop" className="hover:text-acid transition-colors">All products</Link></li>
            <li><Link to="/customize" className="hover:text-acid transition-colors">Custom printing</Link></li>
            <li><Link to="/cart" className="hover:text-acid transition-colors">Cart</Link></li>
            <li><Link to="/app" className="hover:text-acid transition-colors">Open mobile app →</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-slate mb-4">Info</div>
          <ul className="space-y-2 text-sm text-paper/80">
            <li><Link to="/about" className="hover:text-acid transition-colors">About the brand</Link></li>
            <li><Link to="/blog" className="hover:text-acid transition-colors">Journal</Link></li>
            <li><Link to="/terms" className="hover:text-acid transition-colors">Terms &amp; Conditions</Link></li>
            <li><Link to="/privacy" className="hover:text-acid transition-colors">Privacy Policy</Link></li>
            <li><Link to="/privacy#refunds" className="hover:text-acid transition-colors">Refund, Return &amp; Cancellation</Link></li>
            <li><Link to="/privacy#shipping" className="hover:text-acid transition-colors">Shipping Policy</Link></li>
            <li><Link to="/faq" className="hover:text-acid transition-colors">FAQ &amp; size help</Link></li>
            <li><a href="mailto:hello@loopstitch.online" className="hover:text-acid transition-colors">hello@loopstitch.online</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-panel-2 px-5 py-5 text-center font-mono text-[10px] sm:text-[11px] tracking-[0.08em] sm:tracking-widest text-slate-dim leading-relaxed">
        © {new Date().getFullYear()} LOOPSTITCH CO. — LIMITED DROPS AND CUSTOM PRINTS.
      </div>
    </footer>
  )
}
