import type * as React from 'react'
import type { MathfieldElement } from 'mathlive'

declare global {
  interface HTMLElementTagNameMap {
    'math-field': MathfieldElement
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': React.DetailedHTMLProps<React.HTMLAttributes<MathfieldElement>, MathfieldElement>
    }
  }
}

export {}
