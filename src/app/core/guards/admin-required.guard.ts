import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRoleEnum } from '../models/user-role-enum';
import { UserService } from '../services/user.service';

export const adminRequiredGuard: CanActivateFn = async () => {
  const userService = inject(UserService);
  const router = inject(Router);
  const user = await userService.tryLogin();

  if (user?.role === UserRoleEnum.ADMIN) {
    return true;
  }

  return router.parseUrl('/workspace/my-businesses');
};
