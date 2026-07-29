import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {Navbar} from './Navbar';

describe('Navbar authenticated profile footer', () => {
  it('shows the account identity and calls the dedicated sign-out action', () => {
    const onSignOut = vi.fn();
    render(<Navbar currentTab="dashboard" onSelectTab={() => undefined} userRole="admin" onOpenAdmin={() => undefined} onOpenStudyScope={() => undefined} pendingSubmissionsCount={0} userProfile={{name: 'Thang Hong', email: 'thanghong195@gmail.com', avatarUrl: undefined}} onSignOut={onSignOut} />);
    expect(screen.getByText('Thang Hong')).toBeInTheDocument();
    expect(screen.getByText('thanghong195@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Đăng xuất'}));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
