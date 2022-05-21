import { Router } from 'express';
import passport from 'passport';
import { getMe, getOAuth, getToken, login } from '../auth/auth.controller';

export const path = '/auth';
export const router = Router();

/**
 * @openapi
 * /api/auth/oauth:
 *    post:
 *      description: 42 Api에 API key값을 추가해서 요청한다.
 *      tags:
 *      - auth
 *      parameters:
 *      - in: query
 *        name: client url
 *        description: API를 호출한 주소가 정상적인지 확인하는데 사용하는 값
 *        schema:
 *          type: object
 *          required:
 *            - clientURL
 *          properties:
 *            clientURL:
 *              type: string
 *      responses:
 *        '302':
 *          description: 정상적으로 42 Api로 이동
 *          headers:
 *             Location:
 *               description: 42 Api 주소로 이동
 *               schema:
 *                 type: string
 *                 format: uri
 */
router.get('/oauth', getOAuth);

/**
 * @openapi
 * /api/auth/token:
 *    post:
 *      description: 42 OAuth Api의 반환값을 이용하여 토큰을 발급한다.
 *      tags:
 *      - auth
 *      parameters:
 *      - in: query
 *        name: client url
 *        description: API를 호출한 주소가 정상적인지 확인하는데 사용하는 값
 *        schema:
 *          type: object
 *          required:
 *            - clientURL
 *          properties:
 *            clientURL:
 *              type: string
 *      responses:
 *        '302':
 *          description: 성공적으로 토큰 발급
 *          headers:
 *             Location:
 *               description: 브라우저에 유저정보를 저장 하는 frontend /auth 주소로 이동
 *               schema:
 *                 type: string
 *                 format: uri
 *        '401':
 *          description: 42 api와 연동된 ID가 없음, [front에서 알림 후 회원가입창으로 이동]
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  message:
 *                    type: string
 *        '403':
 *          description: client url 값 오류
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  message:
 *                    type: string
 */
router.get('/token', passport.authenticate('42', { session: false }), getToken);

/**
 * @openapi
 * /api/auth/me:
 *    get:
 *      description: 클라이언트의 로그인된 유저 정보를 받아온다.
 *      tags:
 *      - auth
 *      responses:
 *        '200':
 *          description: 로그인 되어 있는 유저의 정보를 반환한다.
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  id:
 *                    description: 로그인한 유저의 PK
 *                    type: integer
 *                  intra:
 *                    description: 인트라 아이디 또는 Email
 *                    type: string
 *                  librarian:
 *                    description: 사서 여부
 *                    type: boolean
 *        '400':
 *          description: 토큰이 없을 경우 에러
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  message:
 *                    type: string
 *        '401':
 *          description: 유저가 없을 경우의 에러
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  message:
 *                    type: string
 */
router.get('/me', passport.authenticate('jwt', { session: false }), getMe);

/**
 * @openapi
 * /api/auth/login:
 *    post:
 *      description: 입력된 회원정보를 Users DB에서 확인하여, Token을 발급해 쿠키에 저장해준다.
 *      tags:
 *      - auth
 *      parameters:
 *      - in: body
 *        name: user
 *        description: 로그인할 유저 정보
 *        schema:
 *          type: object
 *          required:
 *            - id
 *            - password
 *          properties:
 *            id:
 *              type: string
 *            password:
 *              type: string
 *      responses:
 *        '302':
 *          description: 성공적으로 토큰 발급
 *          headers:
 *             Location:
 *               description: 브라우저에 유저정보를 저장 하는 frontend /auth 주소로 이동
 *               schema:
 *                 type: string
 *                 format: uri
 *        '400':
 *          description: ID, PW 값이 없는 잘못된 요청
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  message:
 *                    type: string
 *        '401':
 *          description: ID를 찾을 수 없는 경우
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  message:
 *                    type: string
 *        '403':
 *          description: PW가 틀린 경우
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  message:
 *                    type: string
 */
router.post('/login', login);