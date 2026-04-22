import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { UserService } from '../services/user.service';

export const authRequiredGuard: CanActivateFn = async (_, state) => {
  const userService = inject(UserService);
  const user = await userService.tryLogin();

  if (user) {
    return true;
  }

  await userService.login(state.url);
  return false;
};
