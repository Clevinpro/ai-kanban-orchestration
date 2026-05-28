import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './app/app';

describe('shell', () => {
  it('placeholder', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(document.body).toBeTruthy();
  });
});
