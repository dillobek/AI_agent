/// <reference types="vite/client" />

/**
 * Side-effect CSS imports (`import './styles/theme.css'`) have no type
 * declaration of their own. Vite handles them at build time; this tells
 * TypeScript they are legal module specifiers.
 */
declare module '*.css';
