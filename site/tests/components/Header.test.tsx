import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Header } from '@/components/site/Header';

describe('Header', () => {
  it('renders the brand and nav links', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );
    expect(screen.getByText('observatory')).toBeInTheDocument();
    expect(screen.getByText('archive')).toBeInTheDocument();
    expect(screen.getByText('about')).toBeInTheDocument();
  });
});
