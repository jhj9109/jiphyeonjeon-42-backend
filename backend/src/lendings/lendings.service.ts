import { makeExecuteQuery, executeQuery, pool } from '../mysql';
import { logger } from '../utils/logger';
import * as Models from '../users/users.model';

export const noUserId = '유저 없음';
export const noPermission = '권한 없음';
export const lendingOverload = '2권 이상 대출';
export const lendingOverdue = '연체 중';
export const onLending = '대출 중';
export const onReservation = '예약된 책';
export const lostBook = '분실';
export const damagedBook = '파손';
export const ok = 'ok';
export const nonexistentLending = '존재하지 않는 대출';
export const alreadyReturned = '이미 반납 처리된 대출';

export const create = async (
  userId: number,
  bookId: number,
  librarianId: number,
  condition: string,
): Promise<string> => {
  let message = ok;
  const conn = await pool.getConnection();
  const transactionExecuteQuery = makeExecuteQuery(conn);
  try {
    await conn.beginTransaction();
    // 존재하는 유저인지 확인
    const hasUser = await transactionExecuteQuery(`
      SELECT *
      FROM user
      WHERE id = ?
    `, [userId]);
    if (!hasUser.length) { throw new Error(noUserId); }
    // 유저 권한 없음
    if (hasUser[0].role === 0) { throw new Error(noPermission); }
    // 유저가 2권 이상 대출
    const numberOfLendings = await transactionExecuteQuery(`
      SELECT COUNT(*) as count
      FROM lending
      WHERE userId = ? AND returnedAt IS NULL;
    `, [userId]);
    if (numberOfLendings[0].count >= 2) { throw new Error(lendingOverload); }

    // 유저가 연체중 (패널티를 받았거나 대출중인 책이 반납기한을 넘겼을때)
    const hasPenalty = await transactionExecuteQuery(`
      SELECT penaltyEndDate
      FROM user
      WHERE id = ?
    `, [userId]);
    const isOverdue = await transactionExecuteQuery(`
      SELECT
        CASE WHEN 14 >= DATEDIFF(NOW(), DATE(createdAt)) THEN 0
          ELSE  DATEDIFF(NOW(), DATE(createdAt))
        END AS overdue
      FROM lending
      WHERE userId = ? AND returnedAt IS NULL
    `, [userId]);
    if (hasPenalty[0].penaltyEndDate >= new Date()
      || isOverdue[0]?.overdue) { throw new Error(lendingOverdue); }

    // 책이 대출되지 않은 상태인지
    const isNotLended = await transactionExecuteQuery(`
      SELECT *
      FROM lending
      WHERE bookId = ? AND returnedAt IS NULL
    `, [bookId]);
    if (isNotLended.length !== 0) { throw new Error(onLending); }

    // 책이 분실, 파손이 아닌지
    const isLendableBook = await transactionExecuteQuery(`
     SELECT *
     FROM book
     WHERE id = ?
    `, [bookId]);
    if (isLendableBook[0].status === 1) {
      throw new Error(damagedBook);
    } else if (isLendableBook[0].status === 2) {
      throw new Error(lostBook);
    }

    // 예약된 책이 아닌지
    const isNotReservedBook = await transactionExecuteQuery(`
      SELECT *
      FROM reservation
      WHERE bookId = ? AND status = 0
    `, [bookId]);
    if (isNotReservedBook.length && isNotReservedBook[0].userId !== userId) {
      throw new Error(onReservation);
    }

    await transactionExecuteQuery(`
      INSERT INTO lending (userId, bookId, lendingLibrarianId, lendingCondition)
      VALUES (?, ?, ?, ?)
    `, [userId, bookId, librarianId, condition]);

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    if (e instanceof Error) {
      message = e.message;
    }
  } finally {
    conn.release();
  }
  return message;
};

export const returnBook = async (
  librarianId: number,
  lendingId: number,
  condition: string,
): Promise<string> => {
  let message = ok;
  const conn = await pool.getConnection();
  const transactionExecuteQuery = makeExecuteQuery(conn);
  try {
    await conn.beginTransaction();

    // 유효한 lendingId 인지, 반납처리가 이미 된 책인지 확인
    const lendingInfo = await transactionExecuteQuery(`
      SELECT *
      FROM lending
      WHERE id = ?;
    `, [lendingId]);
    if (!lendingInfo || !lendingInfo[0]) {
      throw new Error(nonexistentLending);
    } else if (lendingInfo[0].returnedAt) {
      throw new Error(alreadyReturned);
    }

    await transactionExecuteQuery(`
      UPDATE lending
      SET returningLibrarian = ?,
          returningCondition = ?,
          returnedAt = NOW()
      WHERE id = ?
    `, [librarianId, lendingId, condition]);

    // 예약된 책이 있다면 예약 부여, endAt 어떻게 처리하지..?
    const isReserved = await transactionExecuteQuery(`
      SELECT *
      FROM reservation
      WHERE bookInfoId = (
        SELECT infoId
        FROM book
        WHERE id = ?
      ) AND status = 0 AND bookId IS NULL
      ORDER BY createdAt
      LIMIT 1;
    `, [lendingInfo[0].bookId]);
    if (isReserved && isReserved[0]) {
      await transactionExecuteQuery(`
        UPDATE reservation
        SET
          bookId = ?,
          endAt =  DATE_ADD(NOW(), INTERVAL 3 DAY)
        WHERE id = ?
    `, [lendingInfo[0].bookId, isReserved[0].id]);
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    if (e instanceof Error) {
      message = e.message;
    }
  } finally {
    conn.release();
  }
  return message;
};

export const search = async (
  query: string,
  page: number,
  limit: number,
  sort:string,
  type: string,
) => {
  logger.debug(`lending search query: ${query} page: ${page} limit: ${limit} sort: ${sort} type: ${type}`);
  let filterQuery;
  switch (type) {
    case 'user':
      filterQuery = `HAVING login LIKE '%${query}%'`;
      break;
    case 'title':
      filterQuery = `HAVING title LIKE '%${query}%'`;
      break;
    case 'callSign':
      filterQuery = `HAVING callSign LIKE '%${query}%'`;
      break;
    default:
      filterQuery = `HAVING login LIKE '%${query}%' OR title LIKE '%${query}%' OR callSign LIKE '%${query}%'`;
  }
  const orderQuery = sort === 'new' ? 'DESC' : '';
  const items = await executeQuery(`
    SELECT
      lending.id,
      lendingCondition,
      user.nickname as login, 
      CASE WHEN NOW() > user.penaltyEndDay THEN 0
        ELSE DATEDIFF(now(), user.penaltyEndDay) 
      END AS penaltyDays,
      (
          SELECT callSign
          FROM book
          WHERE id = bookId
      ) as callSign,
      (
        SELECT title
        FROM book_info
        WHERE id = bookId
      ) AS title,
      DATE_FORMAT(DATE_ADD(lending.createdAt, interval 14 day), '%Y.%m.%d') AS dueDate
    FROM lending
    JOIN user AS user ON lending.userId = user.id
    ${filterQuery}
    ORDER BY lending.createdAt ${orderQuery}
    LIMIT ?
    OFFSET ?
  `, [limit, limit * page]);
  const totalItems = await executeQuery(`
    SELECT
      lending.id,
      (
        SELECT nickname
        FROM user
        WHERE id = userId
      ) AS login, 
      (
        SELECT callSign
        FROM book
        WHERE id = bookId
      ) AS callSign,
      (
        SELECT title
        FROM book_info
        WHERE id = bookId
      ) AS title
    FROM lending
    ${filterQuery}
  `);
  const meta: Models.Meta = {
    totalItems: totalItems.length,
    itemCount: items.length,
    itemsPerPage: limit,
    totalPages: Math.ceil(totalItems.length / limit),
    currentPage: page + 1,
  };
  return { items, meta };
};

export const lendingId = async (id:number) => {
  const data = await executeQuery(`
    SELECT
    lending.id,
    lending.lendingCondition,
    DATE_FORMAT(lending.createdAt, '%Y.%m.%d') as createdAt,
    user.nickname as login,
    CASE
      WHEN user.penaltyEndDate < NOW() THEN 0
      ELSE DATEDIFF(NOW(), user.penaltyEndDate)
    END AS penaltyDays,
    (
        SELECT callSign
        FROM book
        WHERE book.id = lending.bookId
    ) as callSign,
    book.title as title,
    book.image as image,
    DATE_FORMAT(DATE_ADD(lending.createdAt, interval 14 day), '%Y.%m.%d') AS dueDate
    FROM lending
    JOIN user AS user ON user.id = lending.userId
    JOIN book_info AS book ON book.id = lending.bookId
    WHERE lending.id = ?
  `, [id]);
  return data;
};
