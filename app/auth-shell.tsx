
import {UiText,UiField,UiOption} from './ui-language';
import {Sun, Waves, MapPin} from "lucide-react";
import type {ReactNode} from "react";
import "./auth.css";
export default function AuthShell({children}:{children:ReactNode}){return <main className="nv-auth"><section className="nv-auth-shell"><aside className="nv-auth-brand"><UiField as="a" className="nv-wordmark" href="/home" aria-label="Nirili Villa home"><span className="nv-mark"><Sun/><Waves/></span><span><UiText>Nirili Villa</UiText><small><UiText>MALDIVES</UiText></small></span></UiField><div className="nv-brand-message"><span className="nv-eyebrow"><UiText>YOUR ISLAND CONNECTION</UiText></span><h1><UiText>A warm welcome.</UiText><br/><em><UiText>Every time.</UiText></em></h1><p><UiText>Arrive as a guest,</UiText><br/><UiText>leave as a friend.</UiText></p></div><div className="nv-location"><MapPin size={17}/> <UiText>Dhiffushi Island, Maldives</UiText></div></aside><section className="nv-auth-content"><UiText>{children}</UiText><footer className="nv-auth-footer"><UiText>Nirili Villa </UiText><span>•</span> <UiText>Dhiffushi, Maldives</UiText></footer></section></section></main>}
