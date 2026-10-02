// / → HTML o Markdown según la cabecera Accept
import { negotiate } from '../worker/src/markdown.js';

export const onRequest = (ctx) => negotiate(ctx, '/index.md');
