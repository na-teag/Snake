//debugger
const WORLD_HEIGHT = 15
const WORLD_WIDTH = 17
const CELL_SIZE = 36

document.getElementById("gameCanvas").height = WORLD_HEIGHT*CELL_SIZE
document.getElementById("gameCanvas").width = WORLD_WIDTH*CELL_SIZE

const Maybe = value => ({
    isJust: value !== null && value !== undefined,
    map: f => (value != null ? Maybe(f(value)) : Maybe(null)),
    chain: f => (value != null ? f(value) : Maybe(null)),
    getOrElse: def => (value != null ? value : def)
});

const CanvasMonad = canvas => ({
    isJust: canvas !== null && canvas !== undefined,
    map: f => (canvas != null ? CanvasMonad(f(canvas)) : CanvasMonad(null)),
    chain: f => (canvas != null ? f(canvas) : CanvasMonad(null)),
    getOrElse: def => (canvas != null ? canvas : def),
    getContext: type => (canvas != null ? canvas.getContext(type) : null)
})

const InputMonad = target => ({
    subscribe: (eventType, handler) => {
        target.addEventListener(eventType, handler)
        return InputMonad(target)
    },
    map: f => InputMonad(f(target))
})

const entityCreator = entity => ({...entity})

/**
 * convert coordinates from classic math coordinate system where (0;0) is in the bottom left corner
 * to weird reversed y-axis coordinate system where (0;0) is in the top left corner
 * also include proportional conversion to game world size
 *
 * @param x
 * @param y
 * @returns number[]
 */
const convert = (x, y) => [x*CELL_SIZE, (-y+WORLD_HEIGHT-1)*CELL_SIZE, CELL_SIZE, CELL_SIZE];

/**
 * convert coordinates from classic math coordinate system where (0;0) is in the bottom left corner
 * to weird reversed y-axis coordinate system where (0;0) is in the top left corner
 * also include proportional conversion to game world size, and sprite information
 *
 * @param worldX
 * @param worldY
 * @param spriteX
 * @param spriteY
 * @param spriteSize
 * @returns number[]
 */
const convertSnake = (worldX, worldY, spriteX, spriteY, spriteSize) => {
    const spriteSheetHeight = 4
    return [(spriteX-1)*spriteSize, (spriteSheetHeight-spriteY)*spriteSize, spriteSize, spriteSize, ...convert(worldX, worldY)];
}

const composeSystem = systems => systems.reduceRight(
    (acc, system) => state => system(acc(state)),
    state => state
)




function getNextPosition(currentPosition, direction) {
    let x = currentPosition.x
    let y = currentPosition.y
    switch (direction) {
        case "ArrowUp":
            return {x: x, y: y+1}
        case "ArrowDown":
            return {x: x, y: y-1}
        case "ArrowLeft":
            return {x: x-1, y: y}
        case "ArrowRight":
            return {x: x+1, y: y}
        default:
            throw new Error("Unknown direction :"+direction);
    }
}

function getOpposedDirection(direction) {
    switch (direction) {
        case "ArrowUp":
            return "ArrowDown"
        case "ArrowDown":
            return "ArrowUp"
        case "ArrowLeft":
            return "ArrowRight"
        case "ArrowRight":
            return "ArrowLeft"
        default:
            throw new Error("Unknown direction :"+direction);
    }
}

function getEmptyCells(fullCells) {
    // build an array of all possible cell
    const array = [];
    for (let x = 0; x < WORLD_WIDTH; x++) {
        for (let y = 0; y < WORLD_HEIGHT; y++) {
            array.push({ x:x, y:y });
        }
    }
    // get the empty cells
    return array.filter(item =>
        !fullCells.some(element => element.x === item.x && element.y === item.y)
    );
}

function drawBackgroundCells(canvasMonad) {
    const ctx = canvasMonad.getContext('2d')
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    // draw the background cells
    for (let i = 0; i < WORLD_HEIGHT; i++) {
        for (let j = 0; j < WORLD_WIDTH; j++) {
            if ((i % 2 + j) % 2 === 0) {
                ctx.fillStyle = `rgb(170, 215, 81)`
            } else {
                ctx.fillStyle = `rgb(162, 209, 73)`
            }
            ctx.fillRect(...convert(j, i))
        }
    }
}


const inputSystem = (entities, inputMaybe) => entities.map(
    entity => {
        if (entity.id === "snake" && entity.position) {
            const input = inputMaybe.getOrElse({nextDirections: []})
            // cancel commands that go in the same direction that current direction or that are opposed to the current one (forbidden)
            while (input.nextDirections.length>0) {
                if (input.nextDirections[0] === entity.direction || input.nextDirections[0] === getOpposedDirection(entity.direction)) {
                    input.nextDirections.shift()
                } else {
                    break
                }
            }

            if (input.nextDirections.length === 0) {
                // if no new command
                return {
                    ...entity,
                    position: [getNextPosition(entity.position[0], entity.direction), ...entity.position]
                }
            }
            // if there is a next command
            const test = input.nextDirections[0]
            input.nextDirections.shift()
            return {
                ...entity,
                position: [getNextPosition(entity.position[0], test), ...entity.position],
                direction: test
            }
        }
        return entity
    }
)



const appleSystem = entities => entities.map(
    entity => {
        // check if the snake is eating an apple, if no remove the queue
        if (entity.id === "snake" && entity.position) {
            const isEatingApple = entities.some(apple =>
                apple.type === "apple" && apple?.position?.x === entity.position[0].x && apple?.position?.y === entity.position[0].y
            )
            if (isEatingApple) {
                return entity
            }
            return {
                ...entity,
                position: entity.position.slice(0, -1)
            }
        }

        // check if the snake  eating an apple, if yes move the apple
        if (entity.type === "apple" && entity.position) {
            const isEatingApple = entities.some(snake =>
                snake.id === "snake" && snake?.position?.[0]?.x === entity.position.x && snake?.position?.[0]?.y === entity.position.y
            )
            if (isEatingApple) {
                const snake = entities.find(entity2 => entity2.id === "snake")
                const result = getEmptyCells(snake.position)
                const rand = Math.floor(Math.random() * (result.length-1))
                return {
                    ...entity,
                    position: {
                        x: result[rand].x,
                        y: result[rand].y
                    }
                }
            }
        }
        return entity
    }
)



const collisionSystem = (entities, inputMaybe) => entities.map(
    entity => {
        // check if the snake is going outside the world
        if (entity.id === "settings") {
            const snake = entities.find(entity2 => entity2.id === "snake")
            const input = inputMaybe.getOrElse({nextDirections: [snake.direction]})
            let test = input.nextDirections[0] ? input.nextDirections[0] : snake.direction
            // if the direction is not opposed to the current one
            if (test !== getOpposedDirection(snake.direction)) {
                const snakeNextPosition = getNextPosition(snake.position[0], test)

                const snakeOutOfWorld = snakeNextPosition.x < 0 || WORLD_WIDTH-1 < snakeNextPosition.x || snakeNextPosition.y < 0 || WORLD_HEIGHT-1 < snakeNextPosition.y
                // check if a position of a part of the snake has the same coordinate that the snake next position (minus the tail as it will have moved)
                const jammedSnake = snake.position.slice(0,-1).filter((position) => position.x === snakeNextPosition.x && position.y === snakeNextPosition.y)

                if (snakeOutOfWorld  || jammedSnake.length>0) {
                    return {
                        ...entity,
                        gameOn: false,
                        score: snake.position.length-snakeStart.length
                    }
                }
            }
            return {
                ...entity,
                score: snake.position.length-snakeStart.length
            }
        }
        return entity
    }
)



const renderSystem = (entities, canvasMonad, images) => {
    const settings = entities.find(entity2 => entity2.id === "settings")
    if (settings.gameOn) {
        canvasMonad.chain(
            canvas => {
                const ctx = canvasMonad.getContext('2d')
                drawBackgroundCells(canvasMonad)

                // draw the entities
                entities.map(
                    entity => {
                        if (entity.position && entity.sprite) {
                            if (entity.type === "apple") {
                                ctx.drawImage(images[entity.sprite], ...convert(entity.position.x, entity.position.y))
                            } else if (entity.id === "snake") {
                                /* former blue squares to draw snake
                                ctx.fillStyle = entity.type === "snake" ? `rgb(71, 117, 235)` : "black"
                                for (let i = 0; i < entity.position.length; i++) {
                                    ctx.fillRect(...convert(entity.position[i].x, entity.position[i].y))
                                }*/
                                entity.position.map((cell, index) => {
                                    if (index === 0) {
                                        // head sprite
                                        ctx.drawImage(images[entity.sprite], ...convertSnake(entity.position[0].x, entity.position[0].y, entity.spritePosition.head[entity.direction].x, entity.spritePosition.head[entity.direction].y, entity.spriteSize))
                                    } else if (index === entity.position.length-1) {
                                        // tail sprite
                                        // get the difference with position of next snake part
                                        const nextX = entity.position[index-1].x - entity.position[index].x
                                        const nextY = entity.position[index-1].y - entity.position[index].y
                                        const next = nextX+","+nextY
                                        ctx.drawImage(images[entity.sprite], ...convertSnake(entity.position[index].x, entity.position[index].y, entity.spritePosition.tail[next].x, entity.spritePosition.tail[next].y, entity.spriteSize))
                                    } else {
                                        // body sprite
                                        // get the difference with the position of former and next snake part
                                        const nextX = entity.position[index-1].x - entity.position[index].x
                                        const nextY = entity.position[index-1].y - entity.position[index].y
                                        const formerX = entity.position[index+1].x - entity.position[index].x
                                        const formerY = entity.position[index+1].y - entity.position[index].y
                                        const next_former = nextX+","+nextY+";"+formerX+","+formerY
                                        const former_next = formerX+","+formerY+";"+nextX+","+nextY

                                        if (entity.spritePosition.body[former_next]) {
                                            ctx.drawImage(images[entity.sprite], ...convertSnake(entity.position[index].x, entity.position[index].y, entity.spritePosition.body[former_next].x, entity.spritePosition.body[former_next].y, entity.spriteSize))
                                        } else if (entity.spritePosition.body[next_former]) {
                                            ctx.drawImage(images[entity.sprite], ...convertSnake(entity.position[index].x, entity.position[index].y, entity.spritePosition.body[next_former].x, entity.spritePosition.body[next_former].y, entity.spriteSize))
                                        } else {
                                            throw new Error("Unknown entity : "+former_next+" \nUnknown entity : "+next_former)
                                        }
                                    }
                                })
                            }
                        }
                        return entity
                    }
                )
                return CanvasMonad(canvas)
            }
        )
    }
    return entities
}










let entities;
let snakeStart = [{x: 7, y: 3},{x: 7, y: 2}]

function setupEntities() {
    const result = getEmptyCells(snakeStart)
    const rand = Math.floor(Math.random() * (result.length-1))
    return [
        entityCreator({
            id: "settings",
            type: "settings",
            difficulty: 250, // time (ms) between game loops
            gameOn: true,
            score: 0
        }),
        entityCreator({
            id: "snake",
            type: "snake",
            sprite: "snake",
            spriteSize: 64,
            position: snakeStart,
            direction: "ArrowUp",
            spritePosition: {
                "head": {
                    /**
                     * direction of the snake, pointing to the appropriate cell on the sprites sheet
                     */
                    "ArrowUp": {
                        x: 4,
                        y: 4
                    },
                    "ArrowRight": {
                        x: 5,
                        y: 4
                    },
                    "ArrowDown": {
                        x: 5,
                        y: 3
                    },
                    "ArrowLeft": {
                        x: 4,
                        y: 3
                    }
                },/**
                 * difference on the axis with the former and next position (order doesn't matter)
                 * ex : "0,-1;1,0" means that :
                 *                 - the former/next position is +0 on x-axis and -1 on y-axis, i.e. it's at the bottom of the current cell
                 *                 - the next/former position is +1 on the x-axis +0 on the y-axis, i.e. it's at the right of the current cell
                 *  in this example from bottom to right (or right to bottom) in the dictionary it's pointing the sprite on cell (1,4) on the sprites sheet
                 */
                "body": {
                    "1,0;0,1": {
                        x: 1,
                        y: 3
                    },
                    "0,-1;1,0": {
                        x: 1,
                        y: 4
                    },
                    "-1,0;1,0": {
                        x: 2,
                        y: 4
                    },
                    "-1,0;0,-1": {
                        x: 3,
                        y: 4
                    },
                    "0,1;0,-1": {
                        x: 3,
                        y :3
                    },
                    "0,1;-1,0": {
                        x: 3,
                        y: 2
                    }
                },
                /**
                 * for the tail it's just the difference with the next position, "0,1" is going up, so pointing on the (4,2) cell of the sprites sheet
                 */
                "tail": {
                    "0,1": {
                        x: 4,
                        y: 2
                    },
                    "1,0": {
                        x: 5,
                        y: 2
                    },
                    "0,-1": {
                        x: 5,
                        y: 1
                    },
                    "-1,0": {
                        x: 4,
                        y: 1
                    }
                }
            }
        }),
        entityCreator({
            id: "apple",
            type: "apple",
            sprite: "apple",
            position: {x: result[rand].x, y: result[rand].y}
        })
    ]
}

const images = {
    apple: new Image(),
    snake: new Image()
}
images.apple.alt = "apple_image"
images.apple.src = "apple.png"
images.snake.src = "snake.png"
images.snake.alt = "snake_image"

let rawInput = {
    nextDirections: [] // an array containing the next direction commands.
}

let inputMaybe = Maybe(rawInput)
let canvas = document.getElementById("gameCanvas")
let canvasMonad = CanvasMonad(canvas)

const startButton = document.getElementById("startButton");


InputMonad(document).subscribe("keydown", e => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        rawInput.nextDirections.push(e.key)
    }
})

const gameUpdate = composeSystem([
    appleSystem,
    state => inputSystem(state, inputMaybe),
    state => collisionSystem(state, inputMaybe),
    state => renderSystem(state, canvasMonad, images),
])









function gameLoop() {
    const settings = entities.find(entity => entity.id === "settings");
    if (settings.gameOn) {
        entities = gameUpdate(entities)
        document.getElementById("score").innerHTML = settings.score.toString();
        setTimeout(gameLoop, settings.difficulty)
    } else {
        const ctx = canvasMonad.getContext('2d')
        ctx.fillStyle = "black"
        ctx.font = "60px serif";
        ctx.fillText("Game Over", 2*CELL_SIZE, 9*CELL_SIZE)
        document.getElementById("startButton").disabled = false
    }
}

startButton.addEventListener("click", () => {
    entities = setupEntities()
    rawInput.nextDirections = []
    const settings = entities.find(entity => entity.id === "settings");
    settings.gameOn = true;
    settings.difficulty = Number(document.getElementById("difficulty").value)
    document.getElementById("startButton").disabled = true
    document.getElementById("score").innerHTML = "0"

    gameLoop();
});
drawBackgroundCells(canvasMonad)