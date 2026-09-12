import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { installDebugHooks } from './lib/debug';

installDebugHooks();
mount(App, { target: document.getElementById('app')! });
