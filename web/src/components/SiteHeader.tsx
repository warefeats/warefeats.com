import { GithubLogo } from "@phosphor-icons/react";
import { NavLink, useLocation } from "react-router";
import { ThemeToggle } from "./ThemeToggle";

export const REPO_URL = "https://github.com/warefeats/warefeats.com";

export function SiteHeader() {
  // A post sits under Posts in the nav, though only the timeline is that link's own page.
  const { pathname } = useLocation();

  return (
    <header className="site-header">
      <NavLink className="wordmark" to="/" aria-label="warefeats home" end>
        <span className="wordmark-prompt" aria-hidden="true">$</span>
        <span>warefeats</span>
      </NavLink>
      <nav className="primary-nav" aria-label="Primary">
        <NavLink to="/" end className={({ isActive }) => (isActive || pathname.startsWith("/posts/") ? "active" : "")}>Posts</NavLink>
        <NavLink to="/benchmarks/">Benchmarks</NavLink>
        <NavLink to="/methodology/">Methodology</NavLink>
        <NavLink to="/about/">About</NavLink>
      </nav>
      <div className="header-actions">
        <a className="github-link" href={REPO_URL} target="_blank" rel="noreferrer">
          <GithubLogo aria-hidden="true" />
          <span>Source</span>
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}
