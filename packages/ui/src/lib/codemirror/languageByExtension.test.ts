import { EditorState } from '@codemirror/state';
import { describe, expect, test } from 'bun:test';

import { languageByExtension } from './languageByExtension';

describe('languageByExtension', () => {
  test('returns installable extensions for shell-like files', () => {
    for (const filePath of ['Makefile', 'scripts/build.sh', '.env']) {
      const extension = languageByExtension(filePath);

      expect(extension).not.toBeNull();
      if (!extension) {
        throw new Error(`Expected an extension for ${filePath}`);
      }
      EditorState.create({ extensions: [extension] });
    }
  });
});
