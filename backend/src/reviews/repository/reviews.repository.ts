import { Repository } from 'typeorm';
import jipDataSource from '../../app-data-source';
import Reviews from '../../entity/entities/Reviews';
import * as errorCode from '../../utils/error/errorCode';
import { executeQuery, makeExecuteQuery, pool } from '../../mysql';

class ReviewsRepository extends Repository<Reviews> {
  constructor() {
    super(Reviews, jipDataSource.createEntityManager(), jipDataSource.createQueryRunner());
  }

  async createReviews(userId: number, bookInfoId: number, content: string): Promise<void> {
    console.log('create reveiw called');
  }

//  createReviews = async (userId: number, bookInfoId: number, content: string) => {
//  // TODO: bookInfo 검증은 컨트롤러로 위임
//  const numberOfBookInfo = await executeQuery(`
//    SELECT COUNT(*) as coun임
//    FROM book_info
//    WHERE id = ?;
//  `, [bookInfoId]);
//  if (numberOfBookInfo[0].count === 0) { throw new Error(errorCode.INVALID_INPUT_REVIEWS); }
//  const conn = await pool.getConnection();
//  const transactionExecuteQuery = makeExecuteQuery(conn);
//  conn.beginTransaction();
//  try {
//    await transactionExecuteQuery(`
//      INSERT INTO reviews(
//        userId,
//        bookInfoId,
//        updateUserId,
//        isDeleted,
//        content
//      )VALUES (?, ?, ?, ?, ?)
//    `, [userId, bookInfoId, userId, false, content]);
//    conn.commit();
//  } catch (error) {
//    conn.rollback();
//    throw error;
//  } finally {
//    conn.release();
//  }
//};

getReviewsPage = async (
  reviewerId: number,
  isMyReview: boolean,
  titleOrNickname :string,
  disabled: number,
  page: number,
  sort: 'asc' | 'desc',
  limit: number,
) => {
  let reviewFilter = '';
  if (isMyReview) {
    reviewFilter = titleOrNickname === '' ? '' : `AND book_info.title LIKE '%${titleOrNickname}%' `;
    reviewFilter = reviewFilter.concat(`AND reviews.userId = ${reviewerId}`);
  } else {
    reviewFilter = titleOrNickname === '' ? '' : `AND (book_info.title LIKE '%${titleOrNickname}%'
                                                      OR user.nickname LIKE '%${titleOrNickname}%')`;
  }
  const disabledQuery = disabled === -1 ? '' : `AND reviews.disabled = ${disabled}`;
  const sortQuery = `ORDER BY reviews.id ${sort}`;
  const limitQuery = (Number.isNaN(limit)) ? 'LIMIT 10' : `LIMIT ${limit}`;
  const offset = (Number.isNaN(limit)) ? page * 10 : page * limit;

  const reviews = await executeQuery(`
  SELECT
    reviews.id as reviewsId,
    reviews.userId as reviewerId,
    reviews.bookInfoId,
    reviews.content,
    reviews.createdAt,
    reviews.disabled,
    book_info.title,
    user.nickname,
    user.intraId
  FROM reviews
  JOIN user ON user.id = reviews.userId
  JOIN book_info ON reviews.bookInfoId = book_info.id
  WHERE reviews.isDeleted = false
    ${reviewFilter}
    ${disabledQuery}
    ${sortQuery}
  ${limitQuery}
  OFFSET ?
  `, [offset]);
  return (reviews);
};

getReviewsCounts = async (
  reviewerId: number,
  isMyReview: boolean,
  titleOrNickname: string,
  disabled: number,
) => {
  let reviewFilter = '';
  if (isMyReview) {
    reviewFilter = titleOrNickname === '' ? '' : `AND book_info.title LIKE '%${titleOrNickname}%' `;
    reviewFilter = reviewFilter.concat(`AND reviews.userId = ${reviewerId}`);
  } else {
    reviewFilter = titleOrNickname === '' ? '' : `AND (book_info.title LIKE '%${titleOrNickname}%'
                                                      OR user.nickname LIKE '%${titleOrNickname}%')`;
  }
  const disabledQuery = disabled === -1 ? '' : `AND reviews.disabled = ${disabled}`;
  const counts = await executeQuery(`
  SELECT
    COUNT(*) as counts
  FROM reviews
  JOIN user ON user.id = reviews.userId
  JOIN book_info ON reviews.bookInfoId = book_info.id
  WHERE reviews.isDeleted = false
    ${reviewFilter}
    ${disabledQuery}
  `);
  return (counts[0].counts);
};

getReviewsUserId = async (
  reviewsId : number,
) => {
  const reviewsUserId = await executeQuery(`
    SELECT
      userId
    FROM reviews
    WHERE id = ?
    AND isDeleted = false
    `, [reviewsId]);
  return reviewsUserId[0].userId;
};

getReviews = async (
  reviewsId : number,
) => {
  const result: any = await executeQuery(`
    SELECT
      userId,
      disabled
    FROM reviews
    WHERE id = ?
    AND isDeleted = false
    `, [reviewsId]);
  return result;
};

updateReviews = async (
  reviewsId : number,
  userId : number,
  content : string,
) => {
  await executeQuery(`
    UPDATE reviews
    SET
      content = ?,
      updateUserId = ?
    WHERE id = ?
    `, [content, userId, reviewsId]);
};

deleteReviews = async (reviewId: number, deleteUser: number) => {
  await executeQuery(`
      UPDATE reviews
      SET
        isDeleted = ?,
        deleteUserId = ?
      WHERE id = ?
    `, [true, deleteUser, reviewId]);
};

patchReviews = async (
  reviewsId : number,
  userId : number,
) => {
  await executeQuery(`
    UPDATE reviews
    SET
      disabled = IF(disabled=TRUE, FALSE, TRUE),
      disabledUserId = IF(disabled=FALSE, NULL, ?)
    WHERE id = ?
    `, [userId, reviewsId]);
};
}

export = new ReviewsRepository();
