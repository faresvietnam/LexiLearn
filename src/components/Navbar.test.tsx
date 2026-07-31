import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Navbar} from './Navbar';

afterEach(cleanup);

const renderNavbar = ({
  userRole,
  pendingSubmissionsCount,
}: {
  userRole: 'admin' | 'learner';
  pendingSubmissionsCount: number;
}) =>
  render(
    <Navbar
      currentTab="dashboard"
      onSelectTab={() => undefined}
      isSessionStartPending={false}
      userRole={userRole}
      onOpenStudyScope={() => undefined}
      pendingSubmissionsCount={pendingSubmissionsCount}
      userProfile={{name: 'Thang Hong', email: 'thanghong195@gmail.com'}}
      onSignOut={() => undefined}
    />
  );

describe('Navbar authenticated profile footer', () => {
  it('shows the account identity and calls the dedicated sign-out action', () => {
    const onSignOut = vi.fn();
    render(<Navbar currentTab="dashboard" onSelectTab={() => undefined} isSessionStartPending={false} userRole="admin" onOpenStudyScope={() => undefined} pendingSubmissionsCount={0} userProfile={{name: 'Thang Hong', email: 'thanghong195@gmail.com', avatarUrl: undefined}} onSignOut={onSignOut} />);
    expect(screen.getByText('Thang Hong')).toBeInTheDocument();
    expect(screen.getByText('thanghong195@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('Admin', {selector: 'span.rounded-md'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Đăng xuất'}));
    expect(onSignOut).toHaveBeenCalledOnce();
  });
});

describe('Navbar admin navigation', () => {
  it('shows the Admin tab with the pending submission count to admins', () => {
    renderNavbar({userRole: 'admin', pendingSubmissionsCount: 2});

    expect(screen.getByRole('button', {name: /Admin/})).toHaveTextContent('2');
  });

  it('does not show the Admin tab to learners', () => {
    renderNavbar({userRole: 'learner', pendingSubmissionsCount: 2});

    expect(screen.queryByRole('button', {name: /Admin/})).not.toBeInTheDocument();
  });
});

describe('Navbar learning navigation', () => {
  it('renders Học ngay with the same neutral inactive style as other tabs', () => {
    renderNavbar({userRole: 'learner', pendingSubmissionsCount: 0});

    const learnButton = screen.getByRole('button', {name: /Học ngay/});
    expect(learnButton).not.toHaveClass('bg-indigo-600');
    expect(learnButton).toHaveClass('text-slate-600');
  });
});
