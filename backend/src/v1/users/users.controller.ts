import bcrypt from 'bcrypt';
import { NextFunction, Request, Response } from 'express';
import * as status from 'http-status';
import PasswordValidator from 'password-validator';
import { logger } from '~/logger';
import * as errorCode from '~/v1/utils/error/errorCode';
import ErrorResponse from '~/v1/utils/error/errorResponse';
import { User } from '../DTO/users.model';
import UsersService from './users.service';
import { searchSchema } from './users.types';

const usersService = new UsersService();

export const search = async (req: Request, res: Response, next: NextFunction) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    return next(new ErrorResponse(errorCode.INVALID_INPUT, status.BAD_REQUEST));
  }
  const { id, nicknameOrEmail, page, limit } = parsed.data;
  let items;
  try {
    if (!nicknameOrEmail && !id) {
      items = await usersService.searchAllUsers(limit, page);
    } else if (nicknameOrEmail && !id) {
      items = JSON.parse(
        JSON.stringify(
          await usersService.searchUserBynicknameOrEmail(nicknameOrEmail, limit, page),
        ),
      );
    } else if (!nicknameOrEmail && id) {
      items = JSON.parse(JSON.stringify(await usersService.searchUserById(id)));
    }
    if (items) {
      items.items = await Promise.all(
        items.items.map(async (data: User) => ({
          ...data,
          lendings: await usersService.userLendings(data.id),
          reservations: await usersService.userReservations(data.id),
        })),
      );
    }
    return res.json(items);
  } catch (error: any) {
    const errorNumber = parseInt(error.message, 10);
    if (errorNumber >= 200 && errorNumber < 300) {
      next(new ErrorResponse(error.message, status.BAD_REQUEST));
    } else if (error.message === 'DB error') {
      next(new ErrorResponse(errorCode.QUERY_EXECUTION_FAILED, status.INTERNAL_SERVER_ERROR));
    } else {
      logger.error(error);
      next(new ErrorResponse(errorCode.UNKNOWN_ERROR, status.INTERNAL_SERVER_ERROR));
    }
  }
  return 0;
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body;
  const pwSchema = new PasswordValidator();
  if (!email || !password) {
    return next(new ErrorResponse(errorCode.INVALID_INPUT, status.BAD_REQUEST));
  }
  const regex = /@student\.42seoul\.kr$/;
  if (regex.test(email)) {
    return next(new ErrorResponse(errorCode.STUDENT_42_SUBSCRIPTION_FORBIDDEN, status.BAD_REQUEST));
  }
  try {
    pwSchema
      .is()
      .min(10)
      .is()
      .max(42) /* eslint-disable-next-line newline-per-chained-call */
      .has()
      .digits(1) /* eslint-disable-next-line newline-per-chained-call */
      .symbols(1);
    if (!pwSchema.validate(String(password))) {
      return next(new ErrorResponse(errorCode.INVALIDATE_PASSWORD, status.BAD_REQUEST));
    }
    await usersService.createUser(String(email), await bcrypt.hash(String(password), 10));
    return res.status(status.OK).send(`${email} created!`);
  } catch (error: any) {
    const errorNumber = parseInt(error.message, 10);
    if (errorNumber >= 200 && errorNumber < 300) {
      if (errorNumber === 206) next(new ErrorResponse(error.message, status.FORBIDDEN));
      else if (errorNumber === 203) next(new ErrorResponse(error.message, status.CONFLICT));
      else next(new ErrorResponse(error.message, status.BAD_REQUEST));
    } else if (error.message === 'DB error') {
      next(new ErrorResponse(errorCode.QUERY_EXECUTION_FAILED, status.INTERNAL_SERVER_ERROR));
    } else {
      logger.error(error);
      next(new ErrorResponse(errorCode.UNKNOWN_ERROR, status.INTERNAL_SERVER_ERROR));
    }
  }
  return 0;
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { nickname = '', intraId = 0, slack = '', role = -1, penaltyEndDate = '' } = req.body;
  if (
    !id ||
    !(nickname !== '' || intraId !== 0 || slack !== '' || role !== -1 || penaltyEndDate !== '')
  ) {
    return next(new ErrorResponse(errorCode.INVALID_INPUT, status.BAD_REQUEST));
  }
  try {
    const updatedUser = await usersService.updateUserAuth(
      parseInt(id, 10),
      nickname,
      intraId,
      slack,
      role,
      penaltyEndDate,
    );
    return res.status(200).json(updatedUser);
  } catch (error: any) {
    const errorNumber = parseInt(error.message, 10);
    if (errorNumber >= 200 && errorNumber < 300) {
      if (errorNumber === 204) {
        return next(new ErrorResponse(error.message, status.CONFLICT));
      }
      next(new ErrorResponse(error.message, status.BAD_REQUEST));
    } else if (error.message === 'DB error') {
      next(new ErrorResponse(errorCode.QUERY_EXECUTION_FAILED, status.INTERNAL_SERVER_ERROR));
    } else {
      logger.error(error);
      next(new ErrorResponse(errorCode.UNKNOWN_ERROR, status.INTERNAL_SERVER_ERROR));
    }
  }
  return 0;
};

export const myupdate = async (req: Request, res: Response, next: NextFunction) => {
  const { id: tokenId } = req.user as any;
  const { email = '', password = '0' } = req.body;
  if (email === '' && password === '0') {
    return next(new ErrorResponse(errorCode.INVALID_INPUT, status.BAD_REQUEST));
  }
  try {
    if (email !== '' && password === '0') {
      await usersService.updateUserEmail(parseInt(tokenId, 10), email);
    } else if (email === '' && password !== '0') {
      const pwSchema = new PasswordValidator();
      pwSchema
        .is()
        .min(10)
        .is()
        .max(42) /* eslint-disable-next-line newline-per-chained-call */
        .has()
        .lowercase() /* eslint-disable-next-line newline-per-chained-call */
        .has()
        .digits(1) /* eslint-disable-next-line newline-per-chained-call */
        .symbols(1);
      if (!pwSchema.validate(password)) {
        return next(new ErrorResponse(errorCode.INVALIDATE_PASSWORD, status.BAD_REQUEST));
      }
      await usersService.updateUserPassword(parseInt(tokenId, 10), bcrypt.hashSync(password, 10));
    }
    res.status(200).send('success');
  } catch (error: any) {
    const errorNumber = parseInt(error.message, 10);
    if (errorNumber >= 200 && errorNumber < 300) {
      if (errorNumber === 206) {
        return next(new ErrorResponse(error.message, status.FORBIDDEN));
      }
      if (errorNumber === 204) {
        return next(new ErrorResponse(error.message, status.CONFLICT));
      }
      next(new ErrorResponse(error.message, status.BAD_REQUEST));
    } else if (error.message === 'DB error') {
      next(new ErrorResponse(errorCode.QUERY_EXECUTION_FAILED, status.INTERNAL_SERVER_ERROR));
    } else {
      logger.error(error);
      next(new ErrorResponse(errorCode.UNKNOWN_ERROR, status.INTERNAL_SERVER_ERROR));
    }
  }
  return 0;
};

export const mydata = async (
  req: Request,
  res: Response,
) => {
  const { id: tokenId } = req.user as any;
  try {
    const user = await usersService.searchUserById(parseInt(tokenId, 10));
    if (user.items.length === 0) return res.status(404).send('Not Found');
    return res.status(200).json(user.items[0]);
  } catch (error: any) {
    logger.error(error);
    return res.status(500).send('Internal Server Error');
  }
};

export const getVersion = async (req: Request, res: Response) => {

  res.status(200).send({ version: 'gshim.v1' });
  return 0;
};

// TODO: user Delete API
