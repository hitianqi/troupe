// Loaded with `node --import`: registers resolve.mjs, which sits next to it.
import { register } from 'node:module'

register('./resolve.mjs', import.meta.url)
